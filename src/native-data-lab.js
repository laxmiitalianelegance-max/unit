import {
  cancelApproval,
  consumeApproval,
  enforceQuota,
  requestApproval,
} from "./state-services.js";
import {
  HttpError,
  errorResponse,
  json,
  logEvent,
  readJsonLimited,
  readResponseJsonLimited,
  safeError,
  sha256,
} from "./runtime-utils.js";
import { normalizeWorkspacePath } from "./native-project-execution.js";

const COLLECTION = "__unit369_data_lab_v1";
const APPROVAL_KIND = "native-data-lab";
const MAX_DATA_FILES = 5;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_DATASET_BYTES = 3 * 1024 * 1024;
const MAX_IMPORT_BODY_BYTES = 8 * 1024 * 1024;
const MAX_TIMEOUT_MS = 30_000;
const MAX_LOG_CHARS = 48_000;
const MAX_ARTIFACT_FILES = 8;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_ARTIFACT_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_PREVIEW_IMAGE_CHARS = 384 * 1024;
const DATA_EXTENSIONS = new Set([".csv", ".tsv", ".json"]);
const OPERATIONS = new Set(["profile", "clean", "chart"]);
const DATA_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 10 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 40 },
]);
const DATA_IMPORT_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 20 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 100 },
]);

export const DATA_LAB_COMMAND = "python3 -B unit369_data_lab.py";

export const DATA_LAB_PYTHON_SOURCE = String.raw`import json
import math
import os
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

MAX_ROWS = 100000
MAX_COLUMNS = 100
MAX_PREVIEW_ROWS = 10
MAX_TOP_VALUES = 5

INPUT_DIR = Path(os.environ["UNIT369_DATA_INPUT_DIR"])
OUTPUT_DIR = Path(os.environ["UNIT369_DATA_OUTPUT_DIR"])
CONFIG_PATH = Path(os.environ["UNIT369_DATA_CONFIG"])


def scalar(value):
    if value is None:
        return None
    if isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if hasattr(value, "item"):
        try:
            return scalar(value.item())
        except Exception:
            pass
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    return str(value)[:500]


def safe_records(frame):
    records = frame.head(MAX_PREVIEW_ROWS).where(pd.notna(frame), None).to_dict(orient="records")
    return [
        {str(key)[:160]: scalar(value) for key, value in row.items()}
        for row in records
    ]


def load_frame(path):
    suffix = path.suffix.lower()
    truncated_rows = False
    if suffix in (".csv", ".tsv"):
        frame = pd.read_csv(
            path,
            sep="\t" if suffix == ".tsv" else ",",
            nrows=MAX_ROWS + 1,
            low_memory=False,
        )
    elif suffix == ".json":
        with path.open("r", encoding="utf-8") as source:
            value = json.load(source)
        if isinstance(value, dict):
            arrays = [item for item in value.values() if isinstance(item, list)]
            if len(arrays) != 1:
                raise ValueError("JSON must be an array of records or an object containing one record array.")
            value = arrays[0]
        if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
            raise ValueError("JSON records must be objects.")
        truncated_rows = len(value) > MAX_ROWS
        frame = pd.DataFrame(value[:MAX_ROWS])
    else:
        raise ValueError("Unsupported data format.")
    if len(frame.index) > MAX_ROWS:
        truncated_rows = True
        frame = frame.iloc[:MAX_ROWS].copy()
    original_columns = len(frame.columns)
    if original_columns > MAX_COLUMNS:
        frame = frame.iloc[:, :MAX_COLUMNS].copy()
    frame.columns = [str(column)[:160] for column in frame.columns]
    return frame, truncated_rows, max(0, original_columns - len(frame.columns))


def profile_frame(frame):
    columns = []
    for name in frame.columns:
        series = frame[name]
        item = {
            "name": str(name)[:160],
            "dtype": str(series.dtype)[:80],
            "missing": int(series.isna().sum()),
            "unique": int(series.nunique(dropna=True)),
        }
        if pd.api.types.is_numeric_dtype(series):
            numeric = pd.to_numeric(series, errors="coerce")
            clean = numeric.dropna()
            if len(clean.index):
                item["numeric"] = {
                    "mean": scalar(clean.mean()),
                    "median": scalar(clean.median()),
                    "min": scalar(clean.min()),
                    "max": scalar(clean.max()),
                }
        else:
            top = series.dropna().astype(str).value_counts().head(MAX_TOP_VALUES)
            item["top_values"] = [
                {"value": str(key)[:200], "count": int(value)}
                for key, value in top.items()
            ]
        columns.append(item)
    return columns


def safe_stem(path):
    value = re.sub(r"[^A-Za-z0-9_-]+", "-", path.stem).strip("-")
    return value[:80] or "data"


def clean_frame(frame):
    result = frame.copy()
    for column in result.select_dtypes(include=["object", "string"]).columns:
        result[column] = result[column].map(
            lambda value: pd.NA if isinstance(value, str) and not value.strip() else value
        )
    before_empty = len(result.index)
    result = result.dropna(how="all")
    empty_removed = before_empty - len(result.index)
    before_duplicates = len(result.index)
    result = result.drop_duplicates()
    duplicates_removed = before_duplicates - len(result.index)
    protected = 0

    def spreadsheet_safe(value):
        nonlocal protected
        if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
            protected += 1
            return "'" + value
        return value

    for column in result.select_dtypes(include=["object", "string"]).columns:
        result[column] = result[column].map(spreadsheet_safe)
    return result, {
        "empty_rows_removed": int(empty_removed),
        "duplicate_rows_removed": int(duplicates_removed),
        "spreadsheet_formulas_neutralized": int(protected),
    }


def choose_chart(frame, options, output_path):
    numeric = list(frame.select_dtypes(include=[np.number]).columns)
    categorical = [column for column in frame.columns if column not in numeric]
    requested = options.get("chart_type", "auto")
    x_name = options.get("x_column") if options.get("x_column") in frame.columns else None
    y_name = options.get("y_column") if options.get("y_column") in frame.columns else None
    chart_type = requested
    if chart_type == "auto":
        if x_name and y_name and x_name in numeric and y_name in numeric:
            chart_type = "scatter"
        elif categorical and numeric:
            chart_type = "bar"
            x_name, y_name = categorical[0], numeric[0]
        elif numeric:
            chart_type = "histogram"
            x_name = numeric[0]
        elif categorical:
            chart_type = "bar"
            x_name = categorical[0]
        else:
            raise ValueError("No chartable columns were found.")

    fig, axis = plt.subplots(figsize=(8, 4.8))
    if chart_type == "scatter":
        x_name = x_name or (numeric[0] if numeric else None)
        y_name = y_name or (numeric[1] if len(numeric) > 1 else None)
        if not x_name or not y_name:
            raise ValueError("A scatter chart needs two numeric columns.")
        axis.scatter(frame[x_name], frame[y_name], alpha=0.72)
        axis.set_xlabel(str(x_name))
        axis.set_ylabel(str(y_name))
    elif chart_type == "line":
        y_name = y_name or (numeric[0] if numeric else None)
        if not y_name:
            raise ValueError("A line chart needs a numeric column.")
        if x_name:
            axis.plot(frame[x_name], frame[y_name])
            axis.set_xlabel(str(x_name))
        else:
            axis.plot(frame.index, frame[y_name])
            axis.set_xlabel("Row")
        axis.set_ylabel(str(y_name))
    elif chart_type == "histogram":
        x_name = x_name or (numeric[0] if numeric else None)
        if not x_name:
            raise ValueError("A histogram needs a numeric column.")
        frame[x_name].dropna().plot(kind="hist", bins=20, ax=axis)
        axis.set_xlabel(str(x_name))
    else:
        x_name = x_name or (categorical[0] if categorical else None)
        if not x_name:
            raise ValueError("A bar chart needs a category column.")
        if y_name and y_name in numeric:
            values = frame.groupby(x_name, dropna=False)[y_name].mean().sort_values(ascending=False).head(15)
            values.plot(kind="bar", ax=axis)
            axis.set_ylabel("Mean " + str(y_name))
        else:
            values = frame[x_name].fillna("(missing)").astype(str).value_counts().head(15)
            values.plot(kind="bar", ax=axis)
            axis.set_ylabel("Rows")
    axis.set_title("Unit369 Data Lab")
    axis.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(output_path, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    return {
        "type": chart_type,
        "x_column": str(x_name) if x_name else "",
        "y_column": str(y_name) if y_name else "",
        "artifact": output_path.name,
    }


def main():
    with CONFIG_PATH.open("r", encoding="utf-8") as source:
        config = json.load(source)
    operation = config["operation"]
    options = config.get("options", {})
    report = {
        "version": 1,
        "operation": operation,
        "files": [],
        "warnings": [],
    }
    for index, item in enumerate(config["files"]):
        path = INPUT_DIR / item["path"]
        frame, truncated_rows, truncated_columns = load_frame(path)
        file_report = {
            "path": item["path"],
            "format": path.suffix.lower().lstrip("."),
            "row_count": int(len(frame.index)),
            "column_count": int(len(frame.columns)),
            "truncated_rows": bool(truncated_rows),
            "truncated_columns": int(truncated_columns),
            "columns": profile_frame(frame),
            "preview": safe_records(frame),
        }
        if operation == "clean":
            cleaned, cleaning = clean_frame(frame)
            output_name = "cleaned-" + str(index + 1) + "-" + safe_stem(path) + ".csv"
            cleaned.to_csv(OUTPUT_DIR / output_name, index=False)
            file_report["cleaning"] = cleaning
            file_report["cleaned_row_count"] = int(len(cleaned.index))
            file_report["cleaned_artifact"] = output_name
        if operation == "chart" and index == 0:
            file_report["chart"] = choose_chart(frame, options, OUTPUT_DIR / "chart.png")
        if truncated_rows:
            report["warnings"].append(item["path"] + " was limited to 100,000 rows.")
        if truncated_columns:
            report["warnings"].append(item["path"] + " was limited to 100 columns.")
        report["files"].append(file_report)
    with (OUTPUT_DIR / "report.json").open("w", encoding="utf-8") as target:
        json.dump(report, target, ensure_ascii=False, indent=2, allow_nan=False)
    print(json.dumps({"status": "completed", "operation": operation, "files": len(report["files"])}))


if __name__ == "__main__":
    main()
`;

function clean(value, max = 240) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).byteLength;
}

function extension(path) {
  const value = String(path || "").toLowerCase();
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index);
}

function validId(value) {
  return /^[A-Za-z0-9._:-]{1,180}$/.test(String(value || ""));
}

function normalizedDataPath(value) {
  const path = normalizeWorkspacePath(value);
  if (!DATA_EXTENSIONS.has(extension(path))) {
    throw new HttpError(
      415,
      `Unsupported Data Lab file type: ${path}`,
      "unsupported_data_file",
    );
  }
  return path;
}

function validateJsonRecords(file) {
  if (extension(file.path) !== ".json") return;
  let value;
  try {
    value = JSON.parse(file.content);
  } catch {
    throw new HttpError(
      400,
      `${file.path} is not valid JSON.`,
      "invalid_data_json",
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const arrays = Object.values(value).filter(Array.isArray);
    value = arrays.length === 1 ? arrays[0] : null;
  }
  if (
    !Array.isArray(value) ||
    value.some(
      (row) => !row || typeof row !== "object" || Array.isArray(row),
    ) ||
    value.some((row) =>
      Object.values(row).some(
        (entry) => entry !== null && typeof entry === "object",
      ),
    )
  ) {
    throw new HttpError(
      400,
      `${file.path} must contain flat record objects or one flat record array.`,
      "invalid_data_json_shape",
    );
  }
}

function normalizeDataFiles(input) {
  if (!Array.isArray(input) || !input.length) {
    throw new HttpError(
      400,
      "At least one CSV, TSV, or JSON file is required.",
      "data_files_required",
    );
  }
  if (input.length > MAX_DATA_FILES) {
    throw new HttpError(
      413,
      `Data Lab accepts at most ${MAX_DATA_FILES} files per dataset.`,
      "too_many_data_files",
    );
  }
  const seen = new Set();
  let totalBytes = 0;
  const files = input.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new HttpError(
        400,
        "Every data file must be an object.",
        "invalid_data_file",
      );
    }
    const path = normalizedDataPath(source.path || source.name);
    const folded = path.toLowerCase();
    if (seen.has(folded)) {
      throw new HttpError(
        409,
        `Duplicate data path: ${path}`,
        "duplicate_data_path",
      );
    }
    seen.add(folded);
    if (
      typeof source.content !== "string" ||
      source.content.includes("\u0000")
    ) {
      throw new HttpError(
        415,
        `Data files must contain UTF-8 text: ${path}`,
        "binary_data_file",
      );
    }
    const size = byteLength(source.content);
    if (size > MAX_FILE_BYTES) {
      throw new HttpError(
        413,
        `${path} exceeds the 1 MiB Data Lab limit.`,
        "data_file_too_large",
      );
    }
    totalBytes += size;
    if (totalBytes > MAX_DATASET_BYTES) {
      throw new HttpError(
        413,
        "The dataset exceeds the 3 MiB Data Lab limit.",
        "dataset_too_large",
      );
    }
    const file = {
      path,
      content: source.content,
      mime:
        clean(source.mime, 100) ||
        (extension(path) === ".json" ? "application/json" : "text/csv"),
      size,
    };
    validateJsonRecords(file);
    return file;
  });
  return { files, total_bytes: totalBytes };
}

export function normalizeDataLabImport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(
      400,
      "Data Lab import must be an object.",
      "invalid_data_import",
    );
  }
  const normalized = normalizeDataFiles(input.files);
  return {
    name:
      clean(input.name, 180) ||
      normalized.files[0].path.split("/").pop() ||
      "Dataset",
    description: clean(input.description, 1000),
    ...normalized,
  };
}

export async function createDataLabManifest(input) {
  const normalized = normalizeDataFiles(input);
  const entries = await Promise.all(
    normalized.files.map(async (file) => ({
      path: file.path,
      size: file.size,
      sha256: await sha256(file.content),
    })),
  );
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return {
    files: normalized.files,
    entries,
    file_count: entries.length,
    total_bytes: normalized.total_bytes,
    digest: await sha256(JSON.stringify(entries)),
  };
}

function inferredOperation(message) {
  const text = String(message || "").toLowerCase();
  if (/\b(clean|cleanup|deduplic|očist|ocist|duplik|sredi)\w*/i.test(text))
    return "clean";
  if (/\b(chart|graph|plot|grafik|grafikon|vizuel)\w*/i.test(text))
    return "chart";
  return "profile";
}

export function normalizeDataLabRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(
      400,
      "Data Lab request must be an object.",
      "invalid_data_request",
    );
  }
  const operation = clean(
    input.operation || inferredOperation(input.message),
    24,
  ).toLowerCase();
  if (!OPERATIONS.has(operation)) {
    throw new HttpError(
      400,
      "Data Lab operation must be profile, clean, or chart.",
      "invalid_data_operation",
    );
  }
  if (
    ["chart_type", "x_column", "y_column"].some(
      (key) => input[key] !== undefined && String(input[key]).trim(),
    )
  ) {
    throw new HttpError(
      400,
      "Custom chart parameters are not enabled in this Data Lab release.",
      "custom_chart_options_not_supported",
    );
  }
  return {
    operation,
    timeout_ms: MAX_TIMEOUT_MS,
    options: {
      chart_type: "auto",
      x_column: "",
      y_column: "",
    },
  };
}

function boundedLines(value, maxChars = MAX_LOG_CHARS) {
  const lines = String(value ?? "").split(/\r?\n/);
  const result = [];
  let used = 0;
  for (const line of lines.slice(0, 300)) {
    const clipped = line.slice(0, 8_000);
    if (used + clipped.length > maxChars) {
      result.push("[output truncated]");
      break;
    }
    result.push(clipped);
    used += clipped.length;
  }
  while (result.length && !result[result.length - 1]) result.pop();
  return result;
}

function boundedScalar(value) {
  if (value === null || ["boolean", "number"].includes(typeof value))
    return Number.isFinite(value) || typeof value !== "number" ? value : null;
  return clean(value, 500);
}

export function normalizeDataLabReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    version: Number(value.version) || 1,
    operation: OPERATIONS.has(value.operation) ? value.operation : "profile",
    warnings: (Array.isArray(value.warnings) ? value.warnings : [])
      .slice(0, 20)
      .map((item) => clean(item, 500)),
    files: (Array.isArray(value.files) ? value.files : [])
      .slice(0, MAX_DATA_FILES)
      .map((file) => ({
        path: clean(file?.path, 240),
        format: clean(file?.format, 20),
        row_count: Math.max(0, Number(file?.row_count) || 0),
        column_count: Math.max(0, Number(file?.column_count) || 0),
        truncated_rows: file?.truncated_rows === true,
        truncated_columns: Math.max(0, Number(file?.truncated_columns) || 0),
        columns: (Array.isArray(file?.columns) ? file.columns : [])
          .slice(0, 100)
          .map((column) => ({
            name: clean(column?.name, 160),
            dtype: clean(column?.dtype, 80),
            missing: Math.max(0, Number(column?.missing) || 0),
            unique: Math.max(0, Number(column?.unique) || 0),
            ...(column?.numeric && typeof column.numeric === "object"
              ? {
                  numeric: Object.fromEntries(
                    ["mean", "median", "min", "max"].map((key) => [
                      key,
                      boundedScalar(column.numeric[key]),
                    ]),
                  ),
                }
              : {}),
            top_values: (Array.isArray(column?.top_values)
              ? column.top_values
              : []
            )
              .slice(0, 5)
              .map((item) => ({
                value: clean(item?.value, 200),
                count: Math.max(0, Number(item?.count) || 0),
              })),
          })),
        preview: (Array.isArray(file?.preview) ? file.preview : [])
          .slice(0, 10)
          .map((row) =>
            Object.fromEntries(
              Object.entries(
                row && typeof row === "object" && !Array.isArray(row)
                  ? row
                  : {},
              )
                .slice(0, 30)
                .map(([key, entry]) => [clean(key, 160), boundedScalar(entry)]),
            ),
          ),
        ...(file?.cleaning && typeof file.cleaning === "object"
          ? {
              cleaning: {
                empty_rows_removed: Math.max(
                  0,
                  Number(file.cleaning.empty_rows_removed) || 0,
                ),
                duplicate_rows_removed: Math.max(
                  0,
                  Number(file.cleaning.duplicate_rows_removed) || 0,
                ),
                spreadsheet_formulas_neutralized: Math.max(
                  0,
                  Number(file.cleaning.spreadsheet_formulas_neutralized) || 0,
                ),
              },
              cleaned_row_count: Math.max(
                0,
                Number(file.cleaned_row_count) || 0,
              ),
              cleaned_artifact: clean(file.cleaned_artifact, 240),
            }
          : {}),
        ...(file?.chart && typeof file.chart === "object"
          ? {
              chart: {
                type: clean(file.chart.type, 24),
                x_column: clean(file.chart.x_column, 160),
                y_column: clean(file.chart.y_column, 160),
                artifact: clean(file.chart.artifact, 240),
              },
            }
          : {}),
      })),
  };
}

function artifactPath(value) {
  const path = String(value || "").replace(/^\/+/, "");
  try {
    return normalizeWorkspacePath(path);
  } catch {
    return "";
  }
}

function artifactMime(path, fallback) {
  const ext = extension(path);
  if (ext === ".png") return "image/png";
  if (ext === ".json") return "application/json";
  if (ext === ".csv") return "text/csv";
  return clean(fallback || "application/octet-stream", 100);
}

async function collectArtifacts(sandbox, outputDirectory, services, runId) {
  const listed = await sandbox.listFiles(outputDirectory, {
    recursive: true,
    includeHidden: false,
  });
  const candidates = (listed?.files || [])
    .filter((file) => file?.type === "file")
    .sort((left, right) =>
      String(left.relativePath).localeCompare(String(right.relativePath)),
    );
  const artifacts = [];
  let totalBytes = 0;
  let omitted = 0;
  for (const candidate of candidates) {
    const path = artifactPath(candidate.relativePath || candidate.name);
    const size = Number(candidate.size || 0);
    if (
      !path ||
      size < 0 ||
      size > MAX_ARTIFACT_BYTES ||
      artifacts.length >= MAX_ARTIFACT_FILES ||
      totalBytes + size > MAX_ARTIFACT_TOTAL_BYTES
    ) {
      omitted += 1;
      continue;
    }
    const absolutePath = String(candidate.absolutePath || "");
    if (!absolutePath.startsWith(`${outputDirectory}/`)) {
      omitted += 1;
      continue;
    }
    const file = await sandbox.readFile(absolutePath, { encoding: "base64" });
    const content = String(file?.content || "");
    if (content.length > Math.ceil((MAX_ARTIFACT_BYTES * 4) / 3) + 16) {
      omitted += 1;
      continue;
    }
    const mime = artifactMime(path, file?.mimeType);
    const stored = await services.persistArtifact({
      run_id: runId,
      path,
      mime,
      size,
      content,
      encoding: "base64",
    });
    artifacts.push({
      ...stored,
      ...(mime === "image/png" && content.length <= MAX_PREVIEW_IMAGE_CHARS
        ? { preview_base64: content }
        : {}),
    });
    totalBytes += size;
  }
  return { artifacts, artifacts_omitted: omitted };
}

async function temporarySandboxId(ownerId, runId) {
  return `unit369-data-${(await sha256(`${ownerId}:${runId}`)).slice(0, 39)}`;
}

async function readReport(sandbox, outputDirectory) {
  try {
    const file = await sandbox.readFile(`${outputDirectory}/report.json`, {
      encoding: "utf-8",
    });
    const content = String(file?.content || "");
    if (!content || byteLength(content) > 512 * 1024) return null;
    return normalizeDataLabReport(JSON.parse(content));
  } catch {
    return null;
  }
}

async function executeApprovedDataLab(
  env,
  account,
  action,
  manifest,
  runtime,
  services,
) {
  if (!env.UNIT369_SANDBOX || typeof runtime?.getSandbox !== "function") {
    throw new HttpError(
      503,
      "Unit369 Data Lab is not configured.",
      "sandbox_not_configured",
    );
  }
  await enforceQuota(env, account.uid, "native-data-lab", DATA_WINDOWS);
  const runId = `data_${crypto.randomUUID().replace(/-/g, "")}`;
  const sandboxId = await temporarySandboxId(account.uid, runId);
  const sandbox = runtime.getSandbox(env.UNIT369_SANDBOX, sandboxId, {
    sleepAfter: "1m",
    normalizeId: true,
    labels: { workload: "unit369-data", owner: sandboxId.slice(-16) },
  });
  const root = `/workspace/${runId}`;
  const inputDirectory = `${root}/input`;
  const outputDirectory = `${root}/output`;
  const scriptPath = `${root}/unit369_data_lab.py`;
  const configPath = `${root}/config.json`;
  const startedAt = Date.now();
  let result;
  try {
    await sandbox.mkdir(inputDirectory, { recursive: true });
    await sandbox.mkdir(outputDirectory, { recursive: true });
    const directories = new Set([inputDirectory]);
    for (const file of manifest.files) {
      const absolutePath = `${inputDirectory}/${file.path}`;
      const parent = absolutePath.split("/").slice(0, -1).join("/");
      if (!directories.has(parent)) {
        await sandbox.mkdir(parent, { recursive: true });
        directories.add(parent);
      }
      await sandbox.writeFile(absolutePath, file.content, {
        encoding: "utf-8",
      });
    }
    await sandbox.writeFile(scriptPath, DATA_LAB_PYTHON_SOURCE, {
      encoding: "utf-8",
    });
    await sandbox.writeFile(
      configPath,
      JSON.stringify({
        operation: action.operation,
        options: action.options,
        files: manifest.entries.map((file) => ({ path: file.path })),
      }),
      { encoding: "utf-8" },
    );
    const execution = await sandbox.exec(DATA_LAB_COMMAND, {
      cwd: root,
      timeout: action.timeout_ms,
      env: {
        MPLBACKEND: "Agg",
        NO_COLOR: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        UNIT369_DATA_CONFIG: configPath,
        UNIT369_DATA_INPUT_DIR: inputDirectory,
        UNIT369_DATA_OUTPUT_DIR: outputDirectory,
      },
    });
    const report = await readReport(sandbox, outputDirectory);
    const artifactResult = await collectArtifacts(
      sandbox,
      outputDirectory,
      services,
      runId,
    );
    const completed =
      execution?.success === true &&
      Number(execution.exitCode) === 0 &&
      !!report;
    result = {
      run_id: runId,
      engine: "unit369-cloudflare-sandbox",
      status: completed ? "completed" : "failed",
      dataset_id: action.dataset_id,
      operation: action.operation,
      manifest_hash: action.manifest_hash,
      exit_code: Number.isFinite(execution?.exitCode)
        ? execution.exitCode
        : null,
      logs: {
        stdout: boundedLines(execution?.stdout),
        stderr: boundedLines(execution?.stderr),
      },
      report,
      error: completed
        ? null
        : {
            name: "DataLabExecutionFailed",
            message: report
              ? `Data Lab exited with code ${Number.isFinite(execution?.exitCode) ? execution.exitCode : "unknown"}.`
              : "Data Lab did not produce a valid report.",
            traceback: [],
          },
      started_at: startedAt,
      completed_at: Date.now(),
      duration_ms: Date.now() - startedAt,
      ...artifactResult,
    };
    logEvent(completed ? "log" : "warn", "native_data_lab_executed", {
      run_id: runId,
      dataset_id: action.dataset_id,
      operation: action.operation,
      status: result.status,
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
    });
  } catch (error) {
    logEvent("error", "native_data_lab_execution_failed", {
      run_id: runId,
      dataset_id: action.dataset_id,
      operation: action.operation,
      duration_ms: Date.now() - startedAt,
      error: safeError(error),
    });
    throw new HttpError(
      503,
      "The isolated Data Lab is temporarily unavailable.",
      "sandbox_execution_unavailable",
    );
  } finally {
    try {
      await sandbox.destroy();
    } catch (error) {
      logEvent("warn", "native_data_lab_cleanup_failed", {
        run_id: runId,
        error: safeError(error),
      });
    }
  }
  return json(result);
}

export function dataLabCapabilities(configured = false) {
  return {
    engine: "unit369-cloudflare-sandbox",
    configured: configured === true,
    isolated: true,
    owner_scoped: true,
    approval_required: true,
    operations: [...OPERATIONS],
    formats: ["csv", "tsv", "json"],
    arbitrary_code_enabled: false,
    arbitrary_shell_enabled: false,
    secrets_forwarded: false,
    spreadsheet_formula_protection: true,
    limits: {
      max_files: MAX_DATA_FILES,
      max_file_bytes: MAX_FILE_BYTES,
      max_dataset_bytes: MAX_DATASET_BYTES,
      max_rows_per_file: 100_000,
      max_columns_per_file: 100,
      max_timeout_ms: MAX_TIMEOUT_MS,
      max_artifact_files: MAX_ARTIFACT_FILES,
      max_artifact_bytes: MAX_ARTIFACT_BYTES,
    },
  };
}

function nativeStore(env, uid) {
  if (!env.NATIVE_STORE)
    throw new HttpError(
      503,
      "Native data storage is not configured.",
      "native_store_not_configured",
    );
  return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid));
}

async function callStore(env, uid, path, init = {}) {
  const response = await nativeStore(env, uid).fetch(
    new Request(`https://native.internal/native-store${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    }),
  );
  const data = await readResponseJsonLimited(response, 8 * 1024 * 1024);
  if (!response.ok) {
    throw new HttpError(
      response.status,
      data.error || "Native data storage failed.",
      data.code || "native_store_error",
    );
  }
  return data;
}

async function ensureCollection(env, uid) {
  const list = await callStore(env, uid, "/data/collections?limit=200");
  const existing = (list.collections || []).find(
    (collection) => collection.name === COLLECTION,
  );
  if (existing) return existing;
  const created = await callStore(env, uid, "/data/collections", {
    method: "POST",
    body: JSON.stringify({
      name: COLLECTION,
      schema: {
        type: "dataset",
        description: "string",
        manifest_hash: "string",
      },
    }),
  });
  return created.collection;
}

async function getDatasetRecord(env, uid, collectionId, datasetId) {
  try {
    const value = await callStore(
      env,
      uid,
      `/data/collections/${collectionId}/records/${datasetId}`,
    );
    return value.record?.data?.type === "dataset" ? value.record : null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

async function datasetFiles(env, uid, datasetId) {
  const value = await callStore(
    env,
    uid,
    `/files?parent_id=${encodeURIComponent(datasetId)}&limit=200`,
  );
  return value.files || [];
}

async function readInputFiles(env, uid, datasetId) {
  const list = await datasetFiles(env, uid, datasetId);
  const output = [];
  for (const item of list) {
    const value = await callStore(env, uid, `/files/${item.id}`);
    const file = value.file;
    if (file?.parent_id !== datasetId || file?.meta?.kind !== "data-input")
      continue;
    output.push({
      id: file.id,
      path: file.name,
      content: file.body || "",
      mime: file.mime || "text/plain",
      meta: file.meta || {},
    });
  }
  return output;
}

async function createDatasetFile(
  env,
  uid,
  datasetId,
  source,
  kind = "data-input",
) {
  const path =
    kind === "data-input"
      ? normalizedDataPath(source.path || source.name)
      : normalizeWorkspacePath(source.path || source.name);
  const value = await callStore(env, uid, "/files", {
    method: "POST",
    body: JSON.stringify({
      name: path,
      parent_id: datasetId,
      content: String(source.content ?? ""),
      mime: clean(source.mime || "text/plain", 100),
      meta: {
        ...(source.meta && typeof source.meta === "object" ? source.meta : {}),
        dataset_id: datasetId,
        kind,
      },
    }),
  });
  return { ...value.file, path };
}

async function deleteDatasetContents(env, uid, collectionId, datasetId) {
  for (const file of await datasetFiles(env, uid, datasetId)) {
    await callStore(env, uid, `/files/${file.id}`, { method: "DELETE" });
  }
  await callStore(
    env,
    uid,
    `/data/collections/${collectionId}/records/${datasetId}`,
    { method: "DELETE" },
  );
}

async function importDataset(env, account, request) {
  await enforceQuota(
    env,
    account.uid,
    "native-data-lab-import",
    DATA_IMPORT_WINDOWS,
  );
  const body = normalizeDataLabImport(
    await readJsonLimited(request, MAX_IMPORT_BODY_BYTES),
  );
  const collection = await ensureCollection(env, account.uid);
  const created = await callStore(
    env,
    account.uid,
    `/data/collections/${collection.id}/records`,
    {
      method: "POST",
      body: JSON.stringify({
        name: body.name,
        record: {
          type: "dataset",
          name: body.name,
          description: body.description,
        },
      }),
    },
  );
  const datasetId = created.record.id;
  const files = [];
  try {
    for (const file of body.files) {
      files.push(await createDatasetFile(env, account.uid, datasetId, file));
    }
  } catch (error) {
    await deleteDatasetContents(env, account.uid, collection.id, datasetId);
    throw error;
  }
  return json(
    {
      dataset: {
        id: datasetId,
        name: body.name,
        description: body.description,
        created_at: created.record.created_at,
      },
      files,
      total_bytes: body.total_bytes,
    },
    201,
  );
}

export async function handleDataLabExecution(
  request,
  env,
  account,
  runtime,
  services,
  datasetId,
  path,
) {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && path === "capabilities") {
      return json(dataLabCapabilities(!!env.UNIT369_SANDBOX));
    }
    if (request.method === "POST" && path === "plan") {
      if (!env.UNIT369_SANDBOX || typeof runtime?.getSandbox !== "function") {
        throw new HttpError(
          503,
          "Unit369 Data Lab is not configured.",
          "sandbox_not_configured",
        );
      }
      const action = normalizeDataLabRequest(
        await readJsonLimited(request, 16 * 1024),
      );
      const manifest = await createDataLabManifest(
        await services.readInputFiles(),
      );
      const approvedAction = {
        dataset_id: datasetId,
        manifest_hash: manifest.digest,
        file_count: manifest.file_count,
        total_bytes: manifest.total_bytes,
        files: manifest.entries,
        ...action,
      };
      const approval = await requestApproval(
        env,
        account.uid,
        APPROVAL_KIND,
        approvedAction,
      );
      return json(
        {
          approval_required: true,
          message: "Review and explicitly confirm this Data Lab operation.",
          execution: {
            dataset_id: datasetId,
            dataset_name: services.datasetName || "Dataset",
            manifest_hash: manifest.digest,
            file_count: manifest.file_count,
            total_bytes: manifest.total_bytes,
            files: manifest.entries,
            operation: action.operation,
            timeout_ms: action.timeout_ms,
            options: action.options,
          },
          approval,
        },
        202,
      );
    }
    if (request.method === "POST" && path === "confirm") {
      if (!env.UNIT369_SANDBOX || typeof runtime?.getSandbox !== "function") {
        throw new HttpError(
          503,
          "Unit369 Data Lab is not configured.",
          "sandbox_not_configured",
        );
      }
      const body = await readJsonLimited(request, 8 * 1024);
      const consumed = await consumeApproval(
        env,
        account.uid,
        APPROVAL_KIND,
        String(body.approval_id || ""),
        String(body.approval_token || ""),
      );
      if (consumed.action?.dataset_id !== datasetId) {
        throw new HttpError(
          409,
          "Approved dataset does not match this request.",
          "approved_dataset_mismatch",
        );
      }
      const manifest = await createDataLabManifest(
        await services.readInputFiles(),
      );
      if (manifest.digest !== consumed.action.manifest_hash) {
        throw new HttpError(
          409,
          "Dataset files changed after approval was created.",
          "approved_dataset_digest_mismatch",
        );
      }
      return executeApprovedDataLab(
        env,
        account,
        consumed.action,
        manifest,
        runtime,
        services,
      );
    }
    if (request.method === "POST" && path === "cancel") {
      const body = await readJsonLimited(request, 8 * 1024);
      const cancelled = await cancelApproval(
        env,
        account.uid,
        APPROVAL_KIND,
        String(body.approval_id || ""),
        String(body.approval_token || ""),
      );
      return json({ cancelled: cancelled.cancelled === true });
    }
    return json({ error: "Data Lab execution route not found." }, 404);
  } catch (error) {
    return errorResponse(error, { path: url.pathname, method: request.method });
  }
}

export async function handleNativeDataLab(request, env, account, runtime = {}) {
  const url = new URL(request.url);
  const parts = url.pathname
    .replace(/^\/api\/native\/data-lab\/?/, "")
    .split("/")
    .filter(Boolean);
  try {
    if (!parts.length && request.method === "GET") {
      return json(dataLabCapabilities(!!env.UNIT369_SANDBOX));
    }
    if (parts[0] === "capabilities" && request.method === "GET") {
      return json(dataLabCapabilities(!!env.UNIT369_SANDBOX));
    }
    if (parts[0] === "import" && request.method === "POST") {
      return importDataset(env, account, request);
    }
    const datasetId = parts[0];
    if (!validId(datasetId)) {
      return json({ error: "Invalid dataset id." }, 400);
    }
    const collection = await ensureCollection(env, account.uid);
    const record = await getDatasetRecord(
      env,
      account.uid,
      collection.id,
      datasetId,
    );
    if (!record) return json({ error: "Dataset not found." }, 404);
    const dataset = {
      id: record.id,
      name: record.name || record.data?.name || "Dataset",
      description: record.data?.description || "",
    };
    if (parts.length === 1 && request.method === "GET") {
      return json({ dataset });
    }
    if (
      parts[1] === "files" &&
      parts.length === 3 &&
      request.method === "GET"
    ) {
      if (!validId(parts[2])) return json({ error: "Invalid file id." }, 400);
      const value = await callStore(env, account.uid, `/files/${parts[2]}`);
      const file = value.file;
      if (
        file?.parent_id !== datasetId ||
        file?.meta?.kind !== "data-artifact"
      ) {
        return json({ error: "Data Lab artifact not found." }, 404);
      }
      return json({ file: { ...file, path: file.name } });
    }
    if (parts[1] === "executions" && parts.length === 3) {
      return handleDataLabExecution(
        request,
        env,
        account,
        runtime,
        {
          datasetName: dataset.name,
          readInputFiles: () => readInputFiles(env, account.uid, dataset.id),
          persistArtifact: async (artifact) => {
            const file = await createDatasetFile(
              env,
              account.uid,
              dataset.id,
              {
                path: `artifacts/${artifact.run_id}/${artifact.path}`,
                content: artifact.content,
                mime: artifact.mime,
                meta: {
                  encoding: artifact.encoding,
                  run_id: artifact.run_id,
                  original_path: artifact.path,
                },
              },
              "data-artifact",
            );
            return {
              id: file.id,
              path: artifact.path,
              mime: artifact.mime,
              size: artifact.size,
              encoding: artifact.encoding,
            };
          },
        },
        dataset.id,
        parts[2],
      );
    }
    return json({ error: "Data Lab route not found." }, 404);
  } catch (error) {
    return errorResponse(error, { path: url.pathname, method: request.method });
  }
}
