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
const MAX_TREND_SERIES = 10;
const DATA_EXTENSIONS = new Set([".csv", ".tsv", ".json", ".xlsx"]);
const TEXT_DATA_EXTENSIONS = new Set([".csv", ".tsv", ".json"]);
const OPERATIONS = new Set(["profile", "clean", "chart", "trend", "predict"]);
const MAX_XLSX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024;
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
import unicodedata
import warnings
import zipfile
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    f1_score,
    mean_absolute_error,
    r2_score,
    root_mean_squared_error,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

MAX_ROWS = 100000
MAX_COLUMNS = 100
MAX_PREVIEW_ROWS = 10
MAX_TOP_VALUES = 5
MAX_XLSX_MEMBERS = 1000
MAX_XLSX_MEMBER_BYTES = 16 * 1024 * 1024
MAX_XLSX_UNCOMPRESSED_BYTES = 24 * 1024 * 1024
MAX_MODEL_ROWS = 5000
MAX_MODEL_FEATURES = 20
MAX_MODEL_CLASSES = 20
MIN_MODEL_ROWS = 30
MAX_TREND_SERIES = 10
MAX_TREND_CHART_POINTS = 500

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


def validate_xlsx(path):
    if not zipfile.is_zipfile(path):
        raise ValueError("XLSX input is not a valid Office Open XML archive.")
    with zipfile.ZipFile(path) as archive:
        members = archive.infolist()
        names = {member.filename for member in members}
        if len(members) > MAX_XLSX_MEMBERS:
            raise ValueError("XLSX contains too many archive members.")
        if "[Content_Types].xml" not in names or "xl/workbook.xml" not in names:
            raise ValueError("XLSX workbook metadata is missing.")
        total = 0
        for member in members:
            name = member.filename.replace("\\", "/")
            if name.startswith("/") or ".." in Path(name).parts:
                raise ValueError("XLSX contains an unsafe archive path.")
            if member.flag_bits & 0x1:
                raise ValueError("Encrypted XLSX workbooks are not supported.")
            if member.file_size > MAX_XLSX_MEMBER_BYTES:
                raise ValueError("XLSX contains an oversized archive member.")
            total += int(member.file_size)
            if total > MAX_XLSX_UNCOMPRESSED_BYTES:
                raise ValueError("XLSX expands beyond the 24 MiB safety limit.")
            if member.compress_size > 0 and member.file_size > 200 * member.compress_size:
                raise ValueError("XLSX compression ratio exceeds the safety limit.")


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
    elif suffix == ".xlsx":
        validate_xlsx(path)
        frame = pd.read_excel(
            path,
            sheet_name=0,
            engine="openpyxl",
            nrows=MAX_ROWS + 1,
        )
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


MONTH_NAMES = {
    "jan": 1, "january": 1, "januar": 1, "sijecanj": 1,
    "feb": 2, "february": 2, "februar": 2, "veljaca": 2,
    "mar": 3, "march": 3, "mart": 3, "ozujak": 3,
    "apr": 4, "april": 4, "travanj": 4,
    "may": 5, "maj": 5, "svibanj": 5,
    "jun": 6, "june": 6, "lipanj": 6,
    "jul": 7, "july": 7, "srpanj": 7,
    "aug": 8, "august": 8, "avgust": 8, "kolovoz": 8,
    "sep": 9, "sept": 9, "september": 9, "septembar": 9, "rujan": 9,
    "oct": 10, "october": 10, "oktobar": 10, "listopad": 10,
    "nov": 11, "november": 11, "novembar": 11, "studeni": 11,
    "dec": 12, "december": 12, "decembar": 12, "prosinac": 12,
}


def normalized_word(value):
    text = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z]+", "", text.lower())


def parse_time_candidate(series, name):
    parsed = None
    if pd.api.types.is_datetime64_any_dtype(series):
        parsed = pd.to_datetime(series, errors="coerce", utc=True)
    elif pd.api.types.is_numeric_dtype(series):
        label = normalized_word(name)
        if not re.search(r"date|time|datum|vreme|vrijeme|year|godin|month|mesec|mjesec|period", label):
            return None
        numeric = pd.to_numeric(series, errors="coerce")
        clean = numeric.dropna()
        if clean.empty:
            return None
        median = float(clean.median())
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            month_named = bool(re.search(r"month|mesec|mjesec", label))
            month_ratio = float(clean.between(1, 12).mean())
            if month_named and month_ratio >= 0.8:
                parsed = pd.to_datetime(
                    {"year": 2000, "month": numeric.where(numeric.between(1, 12)).round(), "day": 1},
                    errors="coerce",
                    utc=True,
                )
            elif 1900 <= median <= 2200:
                parsed = pd.to_datetime(
                    numeric.round().astype("Int64").astype(str),
                    format="%Y",
                    errors="coerce",
                    utc=True,
                )
            elif 190001 <= median <= 220012:
                parsed = pd.to_datetime(
                    numeric.round().astype("Int64").astype(str),
                    format="%Y%m",
                    errors="coerce",
                    utc=True,
                )
            elif 19000101 <= median <= 22001231:
                parsed = pd.to_datetime(
                    numeric.round().astype("Int64").astype(str),
                    format="%Y%m%d",
                    errors="coerce",
                    utc=True,
                )
            elif median >= 100000000000:
                parsed = pd.to_datetime(numeric, unit="ms", errors="coerce", utc=True)
            elif median >= 1000000000:
                parsed = pd.to_datetime(numeric, unit="s", errors="coerce", utc=True)
            else:
                return None
    else:
        text = series.map(
            lambda value: None if pd.isna(value) else str(value).strip()[:200]
        )
        month_numbers = text.map(
            lambda value: MONTH_NAMES.get(normalized_word(value)) if value else None
        )
        non_null = int(text.notna().sum())
        if non_null and int(month_numbers.notna().sum()) >= max(3, math.ceil(non_null * 0.8)):
            parsed = pd.to_datetime(
                {"year": 2000, "month": month_numbers, "day": 1},
                errors="coerce",
                utc=True,
            )
        else:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                first = pd.to_datetime(text, errors="coerce", utc=True, dayfirst=False)
                second = pd.to_datetime(text, errors="coerce", utc=True, dayfirst=True)
            parsed = second if int(second.notna().sum()) > int(first.notna().sum()) else first
    parsed = pd.Series(parsed, index=series.index)
    source_count = max(1, int(series.notna().sum()))
    valid_count = int(parsed.notna().sum())
    if valid_count < 3 or valid_count / source_count < 0.6 or int(parsed.nunique()) < 3:
        return None
    return parsed


def find_time_column(frame):
    best = None
    for position, name in enumerate(frame.columns):
        parsed = parse_time_candidate(frame[name], name)
        if parsed is None:
            continue
        label = normalized_word(name)
        named = bool(re.search(r"date|time|datum|vreme|vrijeme|year|godin|month|mesec|mjesec|period", label))
        score = (
            1 if named else 0,
            int(parsed.notna().sum()),
            int(parsed.nunique()),
            -position,
        )
        if best is None or score > best[0]:
            best = (score, name, parsed)
    if best is None:
        raise ValueError("Trend analysis needs a date or time column with at least three valid periods.")
    return best[1], best[2]


def build_trends(frame, summary_path, chart_path=None):
    time_name, time_values = find_time_column(frame)
    numeric_columns = [
        column
        for column in frame.select_dtypes(include=[np.number]).columns
        if column != time_name
    ][:MAX_TREND_SERIES]
    if not numeric_columns:
        raise ValueError("Trend analysis needs at least one numeric metric column.")

    series_reports = []
    chart_series = []
    summary_rows = []
    for name in numeric_columns:
        working = pd.DataFrame({
            "period": time_values,
            "value": pd.to_numeric(frame[name], errors="coerce"),
        }).replace([np.inf, -np.inf], np.nan).dropna()
        if working.empty:
            continue
        grouped = working.groupby("period", as_index=False)["value"].mean().sort_values("period")
        if len(grouped.index) < 3:
            continue
        elapsed = (grouped["period"] - grouped["period"].iloc[0]).dt.total_seconds() / 86400.0
        if float(elapsed.max()) <= 0:
            continue
        values = grouped["value"].astype(float)
        slope = float(np.polyfit(elapsed.to_numpy(), values.to_numpy(), 1)[0])
        fitted_change = slope * float(elapsed.max())
        value_std = float(values.std(ddof=0))
        tolerance = max(abs(float(values.mean())) * 0.01, value_std * 0.05, 1e-12)
        direction = "increasing" if fitted_change > tolerance else "decreasing" if fitted_change < -tolerance else "stable"
        start_value = float(values.iloc[0])
        end_value = float(values.iloc[-1])
        absolute_change = end_value - start_value
        percent_change = None if start_value == 0 else (absolute_change / abs(start_value)) * 100.0
        if value_std <= 1e-12:
            strength = 0.0
        else:
            correlation = float(np.corrcoef(elapsed.to_numpy(), values.to_numpy())[0, 1])
            strength = abs(correlation) if math.isfinite(correlation) else None
        item = {
            "metric": str(name)[:160],
            "direction": direction,
            "periods": int(len(grouped.index)),
            "start_period": scalar(grouped["period"].iloc[0]),
            "end_period": scalar(grouped["period"].iloc[-1]),
            "start_value": scalar(start_value),
            "end_value": scalar(end_value),
            "absolute_change": scalar(absolute_change),
            "percent_change": scalar(percent_change),
            "slope_per_day": scalar(slope),
            "strength": scalar(strength),
        }
        series_reports.append(item)
        if len(grouped.index) > MAX_TREND_CHART_POINTS:
            positions = np.linspace(0, len(grouped.index) - 1, MAX_TREND_CHART_POINTS).astype(int)
            chart_series.append((str(name), grouped.iloc[np.unique(positions)]))
        else:
            chart_series.append((str(name), grouped))
        summary_rows.append({
            "date_column": spreadsheet_safe_scalar(str(time_name)),
            **{key: spreadsheet_safe_scalar(value) for key, value in item.items()},
        })
    if not series_reports:
        raise ValueError("No numeric metric had enough dated values for trend analysis.")

    pd.DataFrame(summary_rows).to_csv(summary_path, index=False)
    chart_artifact = ""
    if chart_path is not None:
        shown = chart_series[:4]
        fig, axes = plt.subplots(len(shown), 1, figsize=(9, max(4.8, 3.2 * len(shown))), squeeze=False)
        for axis, (name, grouped) in zip(axes[:, 0], shown):
            axis.plot(grouped["period"], grouped["value"], marker="o", linewidth=1.8)
            axis.set_title(str(name))
            axis.set_xlabel(str(time_name))
            axis.set_ylabel(str(name))
            axis.grid(alpha=0.2)
        fig.suptitle("Unit369 Data Lab — trends")
        fig.tight_layout()
        fig.savefig(chart_path, format="png", dpi=120, bbox_inches="tight")
        plt.close(fig)
        chart_artifact = chart_path.name
    return {
        "date_column": str(time_name)[:160],
        "series": series_reports,
        "summary_artifact": summary_path.name,
        "chart_artifact": chart_artifact,
        "exploratory": True,
        "warnings": [
            "Descriptive trend only: it does not establish causation or guarantee a future forecast."
        ],
    }


def prediction_task(target):
    unique = int(target.nunique(dropna=True))
    if pd.api.types.is_bool_dtype(target):
        return "classification"
    if pd.api.types.is_numeric_dtype(target):
        threshold = min(12, max(2, int(math.sqrt(max(1, len(target.index))))))
        return "classification" if unique <= threshold and unique / max(1, len(target.index)) <= 0.2 else "regression"
    return "classification"


def spreadsheet_safe_scalar(value):
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def build_prediction(frame, options, output_path):
    target_name = str(options.get("target_column", ""))[:160]
    if not target_name or target_name not in frame.columns:
        raise ValueError("The approved prediction target column was not found.")

    working = frame.dropna(subset=[target_name]).copy()
    if len(working.index) < MIN_MODEL_ROWS:
        raise ValueError("Prediction requires at least 30 rows with a target value.")
    if len(working.index) > MAX_MODEL_ROWS:
        working = working.sample(n=MAX_MODEL_ROWS, random_state=369).sort_index()

    target = working[target_name]
    features = working.drop(columns=[target_name])
    warnings = [
        "Exploratory model only: evaluate domain fit and data quality before using predictions for decisions."
    ]
    dropped = []
    for column in list(features.columns):
        series = features[column]
        if series.isna().all():
            dropped.append(str(column))
            features = features.drop(columns=[column])
            continue
        if not pd.api.types.is_numeric_dtype(series):
            unique = int(series.nunique(dropna=True))
            if unique > 50 and unique / max(1, len(series.index)) > 0.5:
                dropped.append(str(column))
                features = features.drop(columns=[column])
    if len(features.columns) > MAX_MODEL_FEATURES:
        dropped.extend(str(column) for column in features.columns[MAX_MODEL_FEATURES:])
        features = features.iloc[:, :MAX_MODEL_FEATURES].copy()
        warnings.append("Prediction was limited to the first 20 usable feature columns.")
    if not len(features.columns):
        raise ValueError("Prediction needs at least one usable feature column.")

    numeric = list(features.select_dtypes(include=[np.number]).columns)
    categorical = [column for column in features.columns if column not in numeric]
    if numeric:
        features[numeric] = features[numeric].replace([np.inf, -np.inf], np.nan)
    for column in categorical:
        features[column] = features[column].map(
            lambda value: np.nan if pd.isna(value) else str(value)[:200]
        )

    transformers = []
    if numeric:
        transformers.append((
            "numeric",
            Pipeline([
                ("imputer", SimpleImputer(strategy="median")),
                ("scale", StandardScaler()),
            ]),
            numeric,
        ))
    if categorical:
        transformers.append((
            "categorical",
            Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("onehot", OneHotEncoder(handle_unknown="ignore", max_categories=20)),
            ]),
            categorical,
        ))
    preprocessor = ColumnTransformer(transformers=transformers, remainder="drop")
    task = prediction_task(target)
    indices = np.asarray(working.index)

    if task == "classification":
        target = target.map(lambda value: str(value)[:160])
        counts = target.value_counts()
        if len(counts.index) < 2:
            raise ValueError("Classification target must contain at least two classes.")
        if len(counts.index) > MAX_MODEL_CLASSES:
            raise ValueError("Classification target may contain at most 20 classes.")
        if int(counts.min()) < 2:
            raise ValueError("Every classification class needs at least two rows.")
        test_rows = max(int(math.ceil(len(target.index) * 0.2)), len(counts.index))
        if len(target.index) - test_rows < len(counts.index):
            raise ValueError("There are not enough rows for a stratified train/test split.")
        split = train_test_split(
            features,
            target,
            indices,
            test_size=test_rows,
            random_state=369,
            stratify=target,
        )
        x_train, x_test, y_train, y_test, _, index_test = split
        model = Pipeline([
            ("prepare", preprocessor),
            ("model", LogisticRegression(max_iter=300, class_weight="balanced")),
        ])
        baseline = DummyClassifier(strategy="most_frequent")
        model_name = "logistic-regression"
    else:
        numeric_target = pd.to_numeric(target, errors="coerce")
        valid = numeric_target.notna()
        features = features.loc[valid].copy()
        target = numeric_target.loc[valid]
        indices = indices[valid.to_numpy()]
        if len(target.index) < MIN_MODEL_ROWS or int(target.nunique()) < 2:
            raise ValueError("Regression target needs at least 30 numeric rows and two distinct values.")
        split = train_test_split(
            features,
            target,
            indices,
            test_size=0.2,
            random_state=369,
        )
        x_train, x_test, y_train, y_test, _, index_test = split
        model = Pipeline([
            ("prepare", preprocessor),
            ("model", Ridge(alpha=1.0, solver="lsqr")),
        ])
        baseline = DummyRegressor(strategy="median")
        model_name = "ridge-regression"

    model.fit(x_train, y_train)
    predicted = model.predict(x_test)
    baseline.fit(np.zeros((len(y_train.index), 1)), y_train)
    baseline_predicted = baseline.predict(np.zeros((len(y_test.index), 1)))

    if task == "classification":
        metrics = {
            "accuracy": scalar(accuracy_score(y_test, predicted)),
            "balanced_accuracy": scalar(balanced_accuracy_score(y_test, predicted)),
            "weighted_f1": scalar(f1_score(y_test, predicted, average="weighted", zero_division=0)),
        }
        baseline_metrics = {
            "accuracy": scalar(accuracy_score(y_test, baseline_predicted)),
            "balanced_accuracy": scalar(balanced_accuracy_score(y_test, baseline_predicted)),
        }
    else:
        metrics = {
            "mae": scalar(mean_absolute_error(y_test, predicted)),
            "rmse": scalar(root_mean_squared_error(y_test, predicted)),
            "r2": scalar(r2_score(y_test, predicted)),
        }
        baseline_metrics = {
            "mae": scalar(mean_absolute_error(y_test, baseline_predicted)),
            "rmse": scalar(root_mean_squared_error(y_test, baseline_predicted)),
        }

    evaluation = pd.DataFrame({
        "row_number": [int(value) + 2 for value in index_test],
        "actual": [spreadsheet_safe_scalar(value) for value in y_test],
        "predicted": [spreadsheet_safe_scalar(value) for value in predicted],
    })
    evaluation.head(1000).to_csv(output_path, index=False)
    if dropped:
        warnings.append("High-cardinality, empty or excess feature columns were excluded.")
    return {
        "target_column": target_name,
        "task_type": task,
        "model": model_name,
        "train_rows": int(len(y_train.index)),
        "test_rows": int(len(y_test.index)),
        "features_used": [str(column)[:160] for column in features.columns],
        "features_dropped": [str(column)[:160] for column in dropped[:50]],
        "metrics": metrics,
        "baseline": baseline_metrics,
        "evaluation_artifact": output_path.name,
        "exploratory": True,
        "model_persisted": False,
        "warnings": warnings,
    }


def main():
    with CONFIG_PATH.open("r", encoding="utf-8") as source:
        config = json.load(source)
    operation = config["operation"]
    options = config.get("options", {})
    report = {
        "version": 3,
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
        if operation == "trend":
            summary_name = "trend-summary-" + str(index + 1) + "-" + safe_stem(path) + ".csv"
            chart_path = OUTPUT_DIR / "trend-chart.png" if index == 0 else None
            file_report["trend"] = build_trends(
                frame, OUTPUT_DIR / summary_name, chart_path
            )
            report["warnings"].extend(file_report["trend"].get("warnings", []))
        if operation == "predict" and index == 0:
            file_report["prediction"] = build_prediction(
                frame, options, OUTPUT_DIR / "prediction-evaluation.csv"
            )
            report["warnings"].extend(file_report["prediction"].get("warnings", []))
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

function base64ByteLength(value) {
  const content = String(value || "");
  if (
    !content ||
    content.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(content) ||
    /=/.test(content.slice(0, -2))
  ) {
    return -1;
  }
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}

function isXlsxSignature(value) {
  try {
    const prefix = atob(String(value || "").slice(0, 16));
    return (
      prefix.charCodeAt(0) === 0x50 &&
      prefix.charCodeAt(1) === 0x4b &&
      prefix.charCodeAt(2) === 0x03 &&
      prefix.charCodeAt(3) === 0x04
    );
  } catch {
    return false;
  }
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
      "At least one CSV, TSV, JSON, or XLSX file is required.",
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
    if (typeof source.content !== "string") {
      throw new HttpError(
        415,
        `Invalid Data Lab content: ${path}`,
        "invalid_data_content",
      );
    }
    const ext = extension(path);
    const encoding = clean(source.encoding || "utf-8", 20).toLowerCase();
    let size;
    if (ext === ".xlsx") {
      if (encoding !== "base64") {
        throw new HttpError(
          415,
          `${path} must use base64 binary encoding.`,
          "xlsx_base64_required",
        );
      }
      size = base64ByteLength(source.content);
      if (size < 0 || !isXlsxSignature(source.content)) {
        throw new HttpError(
          415,
          `${path} is not a valid XLSX upload.`,
          "invalid_xlsx_file",
        );
      }
    } else {
      if (
        !TEXT_DATA_EXTENSIONS.has(ext) ||
        encoding !== "utf-8" ||
        source.content.includes("\u0000")
      ) {
        throw new HttpError(
          415,
          `Data text files must contain UTF-8 text: ${path}`,
          "binary_data_file",
        );
      }
      size = byteLength(source.content);
    }
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
      encoding,
      mime:
        clean(source.mime, 100) ||
        (ext === ".json"
          ? "application/json"
          : ext === ".xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : ext === ".tsv"
              ? "text/tab-separated-values"
              : "text/csv"),
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
      encoding: file.encoding,
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
  if (/\b(predict|prediction|forecast|predvid|prognoz|model)\w*/i.test(text))
    return "predict";
  if (
    /\b(trend|trending|growth|decline|kretanj|trendov|rast|pad|promen|promjen)\w*/i.test(
      text,
    )
  )
    return "trend";
  if (/\b(clean|cleanup|deduplic|očist|ocist|duplik|sredi)\w*/i.test(text))
    return "clean";
  if (/\b(chart|graph|plot|grafik|grafikon|vizuel)\w*/i.test(text))
    return "chart";
  return "profile";
}

function inferredTargetColumn(message) {
  const text = String(message || "");
  const explicit = text.match(
    /(?:target(?:\s+column)?|ciljn(?:a|u)\s+kolon(?:a|u)|kolon(?:a|u)|column)\s*(?:is|je|:|=)?\s*["'`]([^"'`\r\n]{1,160})["'`]/i,
  );
  if (explicit) return clean(explicit[1], 160);
  const quoted = text.match(
    /\b(?:predict|forecast|predvid\w*|prognoz\w*)[^"'`\r\n]{0,40}["'`]([^"'`\r\n]{1,160})["'`]/i,
  );
  return quoted ? clean(quoted[1], 160) : "";
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
      "Data Lab operation must be profile, clean, chart, trend, or predict.",
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
  const targetColumn = clean(
    input.target_column || inferredTargetColumn(input.message),
    160,
  );
  if (operation === "predict" && !targetColumn) {
    throw new HttpError(
      400,
      'Prediction requires an explicit target column, for example: Predvidi "prodaja".',
      "prediction_target_required",
    );
  }
  if (
    operation !== "predict" &&
    input.target_column !== undefined &&
    String(input.target_column).trim()
  ) {
    throw new HttpError(
      400,
      "A target column is accepted only for prediction.",
      "unexpected_prediction_target",
    );
  }
  if (
    ["prediction_type", "feature_columns", "model", "model_options"].some(
      (key) => input[key] !== undefined,
    )
  ) {
    throw new HttpError(
      400,
      "Custom models and model parameters are not enabled.",
      "custom_prediction_options_not_supported",
    );
  }
  return {
    operation,
    timeout_ms: MAX_TIMEOUT_MS,
    options: {
      chart_type: "auto",
      x_column: "",
      y_column: "",
      target_column: targetColumn,
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

function boundedMetrics(value) {
  return Object.fromEntries(
    Object.entries(value && typeof value === "object" ? value : {})
      .slice(0, 12)
      .map(([key, entry]) => [clean(key, 80), boundedScalar(entry)]),
  );
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
        ...(file?.trend && typeof file.trend === "object"
          ? {
              trend: {
                date_column: clean(file.trend.date_column, 160),
                series: (Array.isArray(file.trend.series)
                  ? file.trend.series
                  : []
                )
                  .slice(0, MAX_TREND_SERIES)
                  .map((item) => ({
                    metric: clean(item?.metric, 160),
                    direction: new Set([
                      "increasing",
                      "decreasing",
                      "stable",
                    ]).has(item?.direction)
                      ? item.direction
                      : "stable",
                    periods: Math.max(0, Number(item?.periods) || 0),
                    start_period: clean(item?.start_period, 80),
                    end_period: clean(item?.end_period, 80),
                    start_value: boundedScalar(item?.start_value),
                    end_value: boundedScalar(item?.end_value),
                    absolute_change: boundedScalar(item?.absolute_change),
                    percent_change: boundedScalar(item?.percent_change),
                    slope_per_day: boundedScalar(item?.slope_per_day),
                    strength: boundedScalar(item?.strength),
                  })),
                summary_artifact: clean(file.trend.summary_artifact, 240),
                chart_artifact: clean(file.trend.chart_artifact, 240),
                exploratory: file.trend.exploratory === true,
                warnings: (Array.isArray(file.trend.warnings)
                  ? file.trend.warnings
                  : []
                )
                  .slice(0, 10)
                  .map((item) => clean(item, 500)),
              },
            }
          : {}),
        ...(file?.prediction && typeof file.prediction === "object"
          ? {
              prediction: {
                target_column: clean(file.prediction.target_column, 160),
                task_type: clean(file.prediction.task_type, 32),
                model: clean(file.prediction.model, 80),
                train_rows: Math.max(
                  0,
                  Number(file.prediction.train_rows) || 0,
                ),
                test_rows: Math.max(0, Number(file.prediction.test_rows) || 0),
                features_used: (Array.isArray(file.prediction.features_used)
                  ? file.prediction.features_used
                  : []
                )
                  .slice(0, 20)
                  .map((item) => clean(item, 160)),
                features_dropped: (Array.isArray(
                  file.prediction.features_dropped,
                )
                  ? file.prediction.features_dropped
                  : []
                )
                  .slice(0, 50)
                  .map((item) => clean(item, 160)),
                metrics: boundedMetrics(file.prediction.metrics),
                baseline: boundedMetrics(file.prediction.baseline),
                evaluation_artifact: clean(
                  file.prediction.evaluation_artifact,
                  240,
                ),
                exploratory: file.prediction.exploratory === true,
                model_persisted: file.prediction.model_persisted === true,
                warnings: (Array.isArray(file.prediction.warnings)
                  ? file.prediction.warnings
                  : []
                )
                  .slice(0, 10)
                  .map((item) => clean(item, 500)),
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
        encoding: file.encoding === "base64" ? "base64" : "utf-8",
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
    formats: ["csv", "tsv", "json", "xlsx"],
    arbitrary_code_enabled: false,
    arbitrary_shell_enabled: false,
    secrets_forwarded: false,
    spreadsheet_formula_protection: true,
    xlsx_archive_validation: true,
    trend: {
      time_column_required: true,
      exploratory_only: true,
      max_series: MAX_TREND_SERIES,
    },
    prediction: {
      target_required: true,
      custom_models_enabled: false,
      exploratory_only: true,
      model_persisted: false,
    },
    limits: {
      max_files: MAX_DATA_FILES,
      max_file_bytes: MAX_FILE_BYTES,
      max_dataset_bytes: MAX_DATASET_BYTES,
      max_rows_per_file: 100_000,
      max_columns_per_file: 100,
      max_xlsx_uncompressed_bytes: MAX_XLSX_UNCOMPRESSED_BYTES,
      max_prediction_rows: 5_000,
      max_prediction_features: 20,
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
      encoding: file.meta?.encoding === "base64" ? "base64" : "utf-8",
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
        encoding:
          source.encoding === "base64" || source.meta?.encoding === "base64"
            ? "base64"
            : "utf-8",
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
      if (action.operation === "predict" && manifest.file_count !== 1) {
        throw new HttpError(
          400,
          "Prediction accepts exactly one dataset file per approved run.",
          "prediction_single_file_required",
        );
      }
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
