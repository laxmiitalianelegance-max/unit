import {
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

const APPROVAL_KIND = "native-code-execution";
const MAX_CODE_CHARS = 32_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 64_000;
const MAX_RESULT_CHARS = 24_000;
const MAX_IMAGE_CHARS = 128_000;
const SUPPORTED_LANGUAGES = Object.freeze([
  "python",
  "javascript",
  "typescript",
]);
const EXECUTION_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 20 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 100 },
]);

function clip(value, max) {
  const text = String(value ?? "");
  return text.length <= max ? text : `${text.slice(0, max)}\n[truncated]`;
}

function boundedLines(value, maxChars = MAX_OUTPUT_CHARS) {
  const source = Array.isArray(value) ? value : [];
  const lines = [];
  let used = 0;
  for (const entry of source.slice(0, 200)) {
    const line = clip(entry, 8_000);
    if (used + line.length > maxChars) {
      lines.push("[output truncated]");
      break;
    }
    lines.push(line);
    used += line.length;
  }
  return lines;
}

function boundedJson(value) {
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length <= MAX_RESULT_CHARS) return value;
    return {
      truncated: true,
      preview: clip(encoded, MAX_RESULT_CHARS),
    };
  } catch {
    return { omitted: true, reason: "Result is not JSON serializable." };
  }
}

function imageResult(value) {
  const encoded = String(value || "");
  if (!encoded) return undefined;
  if (encoded.length <= MAX_IMAGE_CHARS) return encoded;
  return {
    omitted: true,
    encoded_characters: encoded.length,
    reason: "Image exceeded the response safety limit.",
  };
}

function normalizeResult(result) {
  if (!result || typeof result !== "object") return {};
  const normalized = {};
  for (const key of ["text", "markdown", "latex"]) {
    if (result[key] !== undefined)
      normalized[key] = clip(result[key], MAX_RESULT_CHARS);
  }
  if (result.markdown !== undefined) normalized.markdown_is_untrusted = true;
  if (result.svg !== undefined) {
    normalized.svg_as_text = clip(result.svg, MAX_RESULT_CHARS);
    normalized.svg_is_untrusted = true;
  }
  if (result.json !== undefined) normalized.json = boundedJson(result.json);
  if (result.data !== undefined) normalized.data = boundedJson(result.data);
  if (result.chart !== undefined) normalized.chart = boundedJson(result.chart);
  if (result.png !== undefined) normalized.png = imageResult(result.png);
  if (result.jpeg !== undefined) normalized.jpeg = imageResult(result.jpeg);
  if (result.html !== undefined) {
    normalized.html_as_text = clip(result.html, MAX_RESULT_CHARS);
    normalized.html_is_untrusted = true;
  }
  return normalized;
}

export function normalizeCodeRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(
      400,
      "Code request must be an object.",
      "invalid_code_request",
    );
  }
  const language = String(input.language || "python")
    .toLowerCase()
    .trim();
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new HttpError(
      400,
      "Language must be python, javascript, or typescript.",
      "unsupported_code_language",
    );
  }
  if (typeof input.code !== "string" || !input.code.trim()) {
    throw new HttpError(400, "Code is required.", "code_required");
  }
  if (input.code.length > MAX_CODE_CHARS) {
    throw new HttpError(
      413,
      "Code exceeds the 32,000 character limit.",
      "code_too_large",
    );
  }
  const requestedTimeout = Number(input.timeout_ms || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(requestedTimeout) || requestedTimeout < 1_000) {
    throw new HttpError(
      400,
      "Execution timeout must be at least 1,000 milliseconds.",
      "invalid_execution_timeout",
    );
  }
  return {
    language,
    code: input.code,
    timeout_ms: Math.min(MAX_TIMEOUT_MS, Math.floor(requestedTimeout)),
  };
}

export function normalizeExecutionResult(execution) {
  const raw =
    execution && typeof execution.toJSON === "function"
      ? execution.toJSON()
      : execution || {};
  const error = raw.error
    ? {
        name: clip(raw.error.name || "ExecutionError", 160),
        message: clip(raw.error.message || "Code execution failed.", 2_000),
        traceback: boundedLines(raw.error.traceback, 16_000),
        line_number: Number.isFinite(raw.error.lineNumber)
          ? raw.error.lineNumber
          : undefined,
      }
    : null;
  return {
    status: error ? "failed" : "completed",
    execution_count: Number.isFinite(raw.executionCount)
      ? raw.executionCount
      : null,
    logs: {
      stdout: boundedLines(raw.logs?.stdout),
      stderr: boundedLines(raw.logs?.stderr),
    },
    error,
    results: Array.isArray(raw.results)
      ? raw.results.slice(0, 8).map(normalizeResult)
      : [],
  };
}

export function codeExecutionCapabilities(configured = false) {
  return {
    engine: "unit369-cloudflare-sandbox",
    configured: configured === true,
    isolated: true,
    approval_required: true,
    owner_scoped: true,
    arbitrary_shell_enabled: false,
    secrets_forwarded: false,
    languages: [...SUPPORTED_LANGUAGES],
    limits: {
      max_code_characters: MAX_CODE_CHARS,
      max_timeout_ms: MAX_TIMEOUT_MS,
      executions_per_hour: 20,
      executions_per_day: 100,
    },
    included_python_libraries: [
      "numpy",
      "pandas",
      "matplotlib",
      "scikit-learn",
    ],
  };
}

async function ownerSandboxId(ownerId) {
  return `unit369-${(await sha256(`sandbox:${ownerId}`)).slice(0, 40)}`;
}

async function executeApproved(env, account, action, runtime) {
  if (!env.UNIT369_SANDBOX || typeof runtime?.getSandbox !== "function") {
    throw new HttpError(
      503,
      "Unit369 isolated execution is not configured.",
      "sandbox_not_configured",
    );
  }
  const normalized = normalizeCodeRequest(action);
  const codeHash = await sha256(normalized.code);
  if (action.code_hash && action.code_hash !== codeHash) {
    throw new HttpError(
      409,
      "Approved code no longer matches its digest.",
      "approved_code_digest_mismatch",
    );
  }
  await enforceQuota(
    env,
    account.uid,
    "native-code-execution",
    EXECUTION_WINDOWS,
  );
  const sandboxId = await ownerSandboxId(account.uid);
  const sandbox = runtime.getSandbox(env.UNIT369_SANDBOX, sandboxId, {
    sleepAfter: "5m",
    labels: {
      workload: "unit369-code",
      owner: sandboxId.slice(-16),
    },
  });
  const runId = `code_${crypto.randomUUID().replace(/-/g, "")}`;
  const startedAt = Date.now();
  try {
    const execution = await sandbox.runCode(normalized.code, {
      language: normalized.language,
      timeout: normalized.timeout_ms,
    });
    const result = normalizeExecutionResult(execution);
    logEvent(
      result.status === "failed" ? "warn" : "log",
      "native_code_executed",
      {
        run_id: runId,
        owner: sandboxId.slice(-16),
        language: normalized.language,
        code_hash: codeHash,
        status: result.status,
        duration_ms: Date.now() - startedAt,
      },
    );
    return json({
      run_id: runId,
      engine: "unit369-cloudflare-sandbox",
      external_ai_required: false,
      sandbox_id: sandboxId,
      language: normalized.language,
      code_hash: codeHash,
      started_at: startedAt,
      completed_at: Date.now(),
      ...result,
    });
  } catch (error) {
    logEvent("error", "native_code_execution_failed", {
      run_id: runId,
      owner: sandboxId.slice(-16),
      language: normalized.language,
      code_hash: codeHash,
      duration_ms: Date.now() - startedAt,
      error: safeError(error),
    });
    throw new HttpError(
      503,
      "The isolated execution container is temporarily unavailable.",
      "sandbox_execution_unavailable",
    );
  }
}

export async function handleNativeCodeExecution(
  request,
  env,
  account,
  runtime,
) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/native\/code\/?/, "");
  try {
    if (request.method === "GET" && path === "capabilities") {
      return json(codeExecutionCapabilities(!!env.UNIT369_SANDBOX));
    }

    if (request.method === "POST" && path === "plan") {
      if (!env.UNIT369_SANDBOX || typeof runtime?.getSandbox !== "function") {
        throw new HttpError(
          503,
          "Unit369 isolated execution is not configured.",
          "sandbox_not_configured",
        );
      }
      const body = await readJsonLimited(request, 48 * 1024);
      const action = normalizeCodeRequest(body);
      const codeHash = await sha256(action.code);
      const approval = await requestApproval(env, account.uid, APPROVAL_KIND, {
        ...action,
        code_hash: codeHash,
      });
      return json(
        {
          approval_required: true,
          message:
            "Review and explicitly confirm this isolated code execution.",
          execution: {
            language: action.language,
            timeout_ms: action.timeout_ms,
            code_hash: codeHash,
            code_characters: action.code.length,
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
          "Unit369 isolated execution is not configured.",
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
      return executeApproved(env, account, consumed.action, runtime);
    }

    return json({ error: "Native code execution route not found." }, 404);
  } catch (error) {
    return errorResponse(error, { path: url.pathname, method: request.method });
  }
}
