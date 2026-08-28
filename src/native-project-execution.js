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
  safeError,
  sha256,
} from "./runtime-utils.js";

const APPROVAL_KIND = "native-project-execution";
const MAX_PROJECT_FILES = 20;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_PROJECT_BYTES = 512 * 1024;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_LOG_CHARS = 64_000;
const MAX_ARTIFACT_FILES = 8;
const MAX_ARTIFACT_BYTES = 256 * 1024;
const MAX_ARTIFACT_TOTAL_BYTES = 1024 * 1024;
const PROJECT_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 10 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 40 },
]);
const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".toml",
  ".ts",
  ".tsx",
  ".tsv",
  ".txt",
  ".yaml",
  ".yml",
]);
const PYTHON_DEPENDENCIES = new Set([
  "matplotlib",
  "numpy",
  "pandas",
  "scikit-learn",
]);

function clean(value, max = 240) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).byteLength;
}

function extension(path) {
  const name = String(path || "").toLowerCase();
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index);
}

export function normalizeWorkspacePath(value) {
  const path = String(value || "").trim();
  if (
    !path ||
    path.length > 240 ||
    path.startsWith("/") ||
    path.includes("\\")
  ) {
    throw new HttpError(
      400,
      "Invalid workspace file path.",
      "invalid_workspace_path",
    );
  }
  if (!/^[A-Za-z0-9_][A-Za-z0-9._/ -]*$/.test(path)) {
    throw new HttpError(
      400,
      "Workspace paths contain unsupported characters.",
      "invalid_workspace_path",
    );
  }
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        segment.toLowerCase() === "node_modules",
    )
  ) {
    throw new HttpError(
      400,
      "Workspace path traversal and hidden paths are not allowed.",
      "invalid_workspace_path",
    );
  }
  return path;
}

function normalizeSourceFiles(input) {
  if (!Array.isArray(input) || !input.length) {
    throw new HttpError(
      400,
      "At least one project file is required.",
      "project_files_required",
    );
  }
  if (input.length > MAX_PROJECT_FILES) {
    throw new HttpError(
      413,
      `A project may contain at most ${MAX_PROJECT_FILES} files.`,
      "too_many_project_files",
    );
  }
  const seen = new Set();
  let totalBytes = 0;
  const files = input.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new HttpError(
        400,
        "Every project file must be an object.",
        "invalid_project_file",
      );
    }
    const path = normalizeWorkspacePath(source.path || source.name);
    const folded = path.toLowerCase();
    if (seen.has(folded)) {
      throw new HttpError(
        409,
        `Duplicate project path: ${path}`,
        "duplicate_project_path",
      );
    }
    seen.add(folded);
    const ext = extension(path);
    if (
      !TEXT_EXTENSIONS.has(ext) &&
      !["dockerfile", "makefile"].includes(folded)
    ) {
      throw new HttpError(
        415,
        `Unsupported project file type: ${path}`,
        "unsupported_project_file",
      );
    }
    if (
      typeof source.content !== "string" ||
      source.content.includes("\u0000")
    ) {
      throw new HttpError(
        415,
        `Project files must contain UTF-8 text: ${path}`,
        "binary_project_file",
      );
    }
    const size = byteLength(source.content);
    if (size > MAX_FILE_BYTES) {
      throw new HttpError(
        413,
        `${path} exceeds the 128 KiB execution limit.`,
        "project_file_too_large",
      );
    }
    totalBytes += size;
    if (totalBytes > MAX_PROJECT_BYTES) {
      throw new HttpError(
        413,
        "Project source exceeds the 512 KiB execution limit.",
        "project_too_large",
      );
    }
    return {
      path,
      content: source.content,
      mime: clean(source.mime || "text/plain", 100) || "text/plain",
      size,
    };
  });
  return { files, total_bytes: totalBytes };
}

export function normalizeProjectImport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(
      400,
      "Project import must be an object.",
      "invalid_project_import",
    );
  }
  const normalized = normalizeSourceFiles(input.files);
  const fallbackName = normalized.files[0].path.split("/").pop() || "Project";
  return {
    name: clean(input.name || fallbackName, 180),
    description: clean(input.description, 1000),
    language: clean(input.language || "auto", 40),
    ...normalized,
  };
}

export async function createProjectManifest(input) {
  const normalized = normalizeSourceFiles(input);
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

function dependencyName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

export function inspectProjectDependencies(files) {
  const dependencies = [];
  const requirements = files.find(
    (file) => file.path.toLowerCase() === "requirements.txt",
  );
  if (requirements) {
    for (const rawLine of requirements.content.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+#.*$/, "").trim();
      if (!line) continue;
      const match = line.match(
        /^([A-Za-z0-9_.-]+)(?:\[[A-Za-z0-9_,.-]+\])?(?:\s*(?:===|==|~=|>=|<=|>|<)\s*[A-Za-z0-9.*+!_-]+)?$/,
      );
      if (!match) {
        throw new HttpError(
          400,
          `Unsupported Python dependency declaration: ${line}`,
          "dependency_not_allowed",
        );
      }
      const name = dependencyName(match[1]);
      if (!PYTHON_DEPENDENCIES.has(name)) {
        throw new HttpError(
          400,
          `Python dependency is not in the Unit369 allowlist: ${name}`,
          "dependency_not_allowed",
        );
      }
      dependencies.push({ ecosystem: "python", name, declaration: line });
    }
  }

  const packageFile = files.find(
    (file) => file.path.toLowerCase() === "package.json",
  );
  if (packageFile) {
    let packageJson;
    try {
      packageJson = JSON.parse(packageFile.content);
    } catch {
      throw new HttpError(
        400,
        "package.json is not valid JSON.",
        "invalid_package_json",
      );
    }
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const declared = packageJson?.[field];
      if (!declared || typeof declared !== "object" || Array.isArray(declared))
        continue;
      for (const [name, version] of Object.entries(declared)) {
        dependencies.push({
          ecosystem: "node",
          name: clean(name, 160),
          declaration: clean(version, 160),
        });
      }
    }
    const blocked = dependencies.filter((item) => item.ecosystem === "node");
    if (blocked.length) {
      throw new HttpError(
        400,
        `Node dependency installation is disabled in this release: ${blocked
          .slice(0, 5)
          .map((item) => item.name)
          .join(", ")}`,
        "dependency_not_allowed",
      );
    }
  }
  return dependencies;
}

function projectLanguage(files) {
  const languages = new Set();
  for (const file of files) {
    const ext = extension(file.path);
    if (ext === ".py") languages.add("python");
    else if ([".js", ".mjs", ".cjs"].includes(ext)) languages.add("javascript");
    else if ([".ts", ".tsx"].includes(ext)) languages.add("typescript");
  }
  if (!languages.size) {
    throw new HttpError(
      400,
      "The workspace has no runnable Python or JavaScript source.",
      "project_source_required",
    );
  }
  if (languages.size > 1) {
    throw new HttpError(
      400,
      "Mixed-language project execution is not enabled yet.",
      "mixed_project_not_supported",
    );
  }
  const language = [...languages][0];
  if (language === "typescript") {
    throw new HttpError(
      400,
      "Multi-file TypeScript execution is not enabled yet; single-file /run typescript remains available.",
      "typescript_project_not_supported",
    );
  }
  return language;
}

function chooseEntrypoint(files, language, requested) {
  const paths = new Set(files.map((file) => file.path));
  if (requested) {
    const entrypoint = normalizeWorkspacePath(requested);
    if (!paths.has(entrypoint)) {
      throw new HttpError(
        400,
        "The requested entrypoint is not in this workspace.",
        "entrypoint_not_found",
      );
    }
    return entrypoint;
  }
  const candidates =
    language === "python"
      ? ["main.py", "app.py", "index.py", "src/main.py", "src/app.py"]
      : ["index.js", "main.js", "app.js", "src/index.js", "src/main.js"];
  const entrypoint = candidates.find((path) => paths.has(path));
  if (!entrypoint) {
    throw new HttpError(
      400,
      "Choose an entrypoint file for this project run.",
      "entrypoint_required",
    );
  }
  return entrypoint;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

export function normalizeProjectExecutionRequest(input, files) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(
      400,
      "Project execution request must be an object.",
      "invalid_project_execution",
    );
  }
  const language = projectLanguage(files);
  const operation = String(input.operation || "check")
    .toLowerCase()
    .trim();
  if (!new Set(["check", "test", "run"]).has(operation)) {
    throw new HttpError(
      400,
      "Project operation must be check, test, or run.",
      "invalid_project_operation",
    );
  }
  const requestedTimeout = Number(input.timeout_ms || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(requestedTimeout) || requestedTimeout < 1_000) {
    throw new HttpError(
      400,
      "Project timeout must be at least 1,000 milliseconds.",
      "invalid_execution_timeout",
    );
  }
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.floor(requestedTimeout));
  const dependencies = inspectProjectDependencies(files);
  let entrypoint = "";
  let command = "";
  let commandLabel = "";
  if (operation === "check" && language === "python") {
    command = "python3 -B -m compileall -q .";
    commandLabel = "Python syntax check";
  } else if (operation === "check") {
    command =
      "find . -type f \\( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \\) -print0 | xargs -0 -r -n1 node --check";
    commandLabel = "JavaScript syntax check";
  } else if (operation === "test" && language === "python") {
    command = "python3 -B -m unittest discover -s . -p 'test*.py' -v";
    commandLabel = "Python unittest";
  } else if (operation === "test") {
    command = "node --test";
    commandLabel = "Node test runner";
  } else {
    entrypoint = chooseEntrypoint(
      files,
      language,
      clean(input.entrypoint, 240),
    );
    command =
      language === "python"
        ? `python3 -B ${shellQuote(entrypoint)}`
        : `node ${shellQuote(entrypoint)}`;
    commandLabel = `${language === "python" ? "Python" : "Node"} run · ${entrypoint}`;
  }
  return {
    operation,
    language,
    entrypoint,
    timeout_ms: timeoutMs,
    command,
    command_label: commandLabel,
    dependencies,
  };
}

function boundedLines(value, maxChars = MAX_LOG_CHARS) {
  const lines = String(value ?? "").split(/\r?\n/);
  const result = [];
  let used = 0;
  for (const line of lines.slice(0, 400)) {
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

function artifactRelativePath(value) {
  const path = String(value || "").replace(/^\/+/, "");
  try {
    return normalizeWorkspacePath(path);
  } catch {
    return "";
  }
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
    const path = artifactRelativePath(candidate.relativePath || candidate.name);
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
    const stored = await services.persistArtifact({
      run_id: runId,
      path,
      mime: clean(file?.mimeType || "application/octet-stream", 100),
      size,
      content: String(file?.content || ""),
      encoding: "base64",
    });
    artifacts.push(stored);
    totalBytes += size;
  }
  return { artifacts, artifacts_omitted: omitted };
}

async function temporarySandboxId(ownerId, runId) {
  return `unit369-project-${(await sha256(`${ownerId}:${runId}`)).slice(0, 36)}`;
}

async function executeApprovedProject(
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
      "Unit369 project execution is not configured.",
      "sandbox_not_configured",
    );
  }
  await enforceQuota(
    env,
    account.uid,
    "native-project-execution",
    PROJECT_WINDOWS,
  );
  const runId = `project_${crypto.randomUUID().replace(/-/g, "")}`;
  const sandboxId = await temporarySandboxId(account.uid, runId);
  const sandbox = runtime.getSandbox(env.UNIT369_SANDBOX, sandboxId, {
    sleepAfter: "1m",
    normalizeId: true,
    labels: { workload: "unit369-project", owner: sandboxId.slice(-16) },
  });
  const root = `/workspace/${runId}`;
  const sourceDirectory = `${root}/source`;
  const outputDirectory = `${root}/output`;
  const startedAt = Date.now();
  let result;
  try {
    await sandbox.mkdir(sourceDirectory, { recursive: true });
    await sandbox.mkdir(outputDirectory, { recursive: true });
    const directories = new Set([sourceDirectory]);
    for (const file of manifest.files) {
      const absolutePath = `${sourceDirectory}/${file.path}`;
      const parent = absolutePath.split("/").slice(0, -1).join("/");
      if (!directories.has(parent)) {
        await sandbox.mkdir(parent, { recursive: true });
        directories.add(parent);
      }
      await sandbox.writeFile(absolutePath, file.content, {
        encoding: "utf-8",
      });
    }
    const execution = await sandbox.exec(action.command, {
      cwd: sourceDirectory,
      timeout: action.timeout_ms,
      env: {
        NO_COLOR: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        UNIT369_OUTPUT_DIR: outputDirectory,
      },
    });
    const artifactResult = await collectArtifacts(
      sandbox,
      outputDirectory,
      services,
      runId,
    );
    const completed =
      execution?.success === true && Number(execution.exitCode) === 0;
    result = {
      run_id: runId,
      engine: "unit369-cloudflare-sandbox",
      status: completed ? "completed" : "failed",
      workspace_id: action.workspace_id,
      operation: action.operation,
      language: action.language,
      entrypoint: action.entrypoint || "",
      command_label: action.command_label,
      manifest_hash: action.manifest_hash,
      exit_code: Number.isFinite(execution?.exitCode)
        ? execution.exitCode
        : null,
      logs: {
        stdout: boundedLines(execution?.stdout),
        stderr: boundedLines(execution?.stderr),
      },
      error: completed
        ? null
        : {
            name: "ProjectCommandFailed",
            message: `Project command exited with code ${Number.isFinite(execution?.exitCode) ? execution.exitCode : "unknown"}.`,
            traceback: [],
          },
      started_at: startedAt,
      completed_at: Date.now(),
      duration_ms: Date.now() - startedAt,
      ...artifactResult,
    };
    logEvent(completed ? "log" : "warn", "native_project_executed", {
      run_id: runId,
      workspace_id: action.workspace_id,
      operation: action.operation,
      language: action.language,
      status: result.status,
      exit_code: result.exit_code,
      duration_ms: result.duration_ms,
    });
  } catch (error) {
    logEvent("error", "native_project_execution_failed", {
      run_id: runId,
      workspace_id: action.workspace_id,
      operation: action.operation,
      duration_ms: Date.now() - startedAt,
      error: safeError(error),
    });
    throw new HttpError(
      503,
      "The isolated project runner is temporarily unavailable.",
      "sandbox_execution_unavailable",
    );
  } finally {
    try {
      await sandbox.destroy();
    } catch (error) {
      logEvent("warn", "native_project_sandbox_cleanup_failed", {
        run_id: runId,
        error: safeError(error),
      });
    }
  }
  return json(result);
}

export function projectExecutionCapabilities(configured = false) {
  return {
    configured: configured === true,
    isolated: true,
    approval_required: true,
    operations: ["check", "test", "run"],
    languages: ["python", "javascript"],
    arbitrary_shell_enabled: false,
    dependency_installation_enabled: false,
    secrets_forwarded: false,
    output_directory_environment_variable: "UNIT369_OUTPUT_DIR",
    limits: {
      max_files: MAX_PROJECT_FILES,
      max_file_bytes: MAX_FILE_BYTES,
      max_project_bytes: MAX_PROJECT_BYTES,
      max_timeout_ms: MAX_TIMEOUT_MS,
      max_artifact_files: MAX_ARTIFACT_FILES,
      max_artifact_bytes: MAX_ARTIFACT_BYTES,
    },
  };
}

export async function handleProjectExecution(
  request,
  env,
  account,
  runtime,
  services,
  workspaceId,
  path,
) {
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && path === "capabilities") {
      return json(projectExecutionCapabilities(!!env.UNIT369_SANDBOX));
    }
    if (request.method === "POST" && path === "plan") {
      if (!env.UNIT369_SANDBOX || typeof runtime?.getSandbox !== "function") {
        throw new HttpError(
          503,
          "Unit369 project execution is not configured.",
          "sandbox_not_configured",
        );
      }
      const body = await readJsonLimited(request, 16 * 1024);
      const manifest = await createProjectManifest(
        await services.readSourceFiles(),
      );
      const execution = normalizeProjectExecutionRequest(body, manifest.files);
      const action = {
        workspace_id: workspaceId,
        manifest_hash: manifest.digest,
        file_count: manifest.file_count,
        total_bytes: manifest.total_bytes,
        files: manifest.entries,
        ...execution,
      };
      const approval = await requestApproval(
        env,
        account.uid,
        APPROVAL_KIND,
        action,
      );
      return json(
        {
          approval_required: true,
          message:
            "Review and explicitly confirm this isolated project execution.",
          execution: {
            workspace_id: workspaceId,
            workspace_name: services.workspaceName,
            manifest_hash: manifest.digest,
            file_count: manifest.file_count,
            total_bytes: manifest.total_bytes,
            files: manifest.entries,
            operation: execution.operation,
            language: execution.language,
            entrypoint: execution.entrypoint,
            timeout_ms: execution.timeout_ms,
            command_label: execution.command_label,
            dependencies: execution.dependencies,
          },
          approval,
        },
        202,
      );
    }
    if (request.method === "POST" && path === "confirm") {
      const body = await readJsonLimited(request, 8 * 1024);
      const consumed = await consumeApproval(
        env,
        account.uid,
        APPROVAL_KIND,
        String(body.approval_id || ""),
        String(body.approval_token || ""),
      );
      if (consumed.action?.workspace_id !== workspaceId) {
        throw new HttpError(
          409,
          "Approved workspace does not match this request.",
          "approved_workspace_mismatch",
        );
      }
      const manifest = await createProjectManifest(
        await services.readSourceFiles(),
      );
      if (manifest.digest !== consumed.action.manifest_hash) {
        throw new HttpError(
          409,
          "Workspace files changed after approval was created.",
          "approved_project_digest_mismatch",
        );
      }
      return executeApprovedProject(
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
    return json({ error: "Project execution route not found." }, 404);
  } catch (error) {
    return errorResponse(error, { path: url.pathname, method: request.method });
  }
}
