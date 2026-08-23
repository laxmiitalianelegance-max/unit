import {
  HttpError,
  logEvent,
  readResponseJsonLimited,
  safeError,
} from "./runtime-utils.js";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 24_000;
const UPSTREAM_TIMEOUT_MS = 35_000;

function cleanModel(value, fallback) {
  const model = String(value || "").trim();
  return /^[A-Za-z0-9@._:/-]{1,120}$/.test(model) ? model : fallback;
}

export function normalizeMessages(value) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > MAX_MESSAGES
  ) {
    throw new HttpError(
      400,
      `Provide between 1 and ${MAX_MESSAGES} messages.`,
      "invalid_messages",
    );
  }
  let total = 0;
  const messages = value.map((entry) => {
    const role = String(entry?.role || "").toLowerCase();
    if (!new Set(["system", "user", "assistant"]).has(role)) {
      throw new HttpError(
        400,
        "Message role must be system, user or assistant.",
        "invalid_message_role",
      );
    }
    const content = String(entry?.content || "").trim();
    if (!content || content.length > MAX_MESSAGE_CHARS) {
      throw new HttpError(
        400,
        `Each message must contain 1-${MAX_MESSAGE_CHARS} characters.`,
        "invalid_message_content",
      );
    }
    total += content.length;
    return { role, content };
  });
  if (total > MAX_TOTAL_CHARS) {
    throw new HttpError(
      413,
      `Conversation exceeds the ${MAX_TOTAL_CHARS} character limit.`,
      "conversation_too_large",
    );
  }
  return messages;
}

function maxTokens(value, fallback = 900) {
  return Math.max(1, Math.min(2_500, Number(value) || fallback));
}

async function upstreamJson(url, init, provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await readResponseJsonLimited(response, 768 * 1024);
    if (!response.ok) {
      if (response.status === 429) {
        throw new HttpError(
          429,
          `${provider} request limit reached. Try again later.`,
          `${provider}_rate_limited`,
        );
      }
      const detail = String(
        data?.error?.message ||
          data?.error ||
          data?.message ||
          `${provider} returned HTTP ${response.status}`,
      ).slice(0, 500);
      logEvent("warn", "ai_upstream_rejected", {
        provider,
        status: response.status,
        detail,
      });
      const error = new HttpError(
        502,
        `${provider} request failed. Try another provider or try again later.`,
        `${provider}_upstream_error`,
      );
      error.diagnostic = `HTTP ${response.status}: ${detail}`;
      throw error;
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(
        504,
        `${provider} request timed out.`,
        `${provider}_timeout`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function configuredProviders(env) {
  return {
    workersAi: !!env.AI,
    claude: !!env.ANTHROPIC_API_KEY,
    openai: !!env.OPENAI_API_KEY,
    grok: !!(env.GROK_API_KEY || env.XAI_API_KEY),
    shopify: !!(
      env.SHOPIFY_SHOP &&
      env.SHOPIFY_CLIENT_ID &&
      env.SHOPIFY_CLIENT_SECRET
    ),
  };
}

export async function runWorkersAi(env, messages, options = {}) {
  if (!env.AI)
    throw new HttpError(
      503,
      "Workers AI is not configured.",
      "workers_ai_unavailable",
    );
  const model = cleanModel(
    options.model,
    "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  );
  const result = await env.AI.run(model, {
    messages: normalizeMessages(messages),
    max_tokens: maxTokens(options.maxTokens),
  });
  const content = String(result?.response || "").trim();
  if (!content)
    throw new HttpError(
      502,
      "Workers AI returned an empty response.",
      "workers_ai_empty",
    );
  return { provider: "workers", model, content };
}

async function runClaude(env, messages, options = {}) {
  if (!env.ANTHROPIC_API_KEY)
    throw new HttpError(503, "Claude is not configured.", "claude_unavailable");
  const normalized = normalizeMessages(messages);
  const system = normalized
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const conversation = normalized.filter(
    (message) => message.role !== "system",
  );
  if (!conversation.some((message) => message.role === "user")) {
    throw new HttpError(
      400,
      "Claude requires a user message.",
      "claude_user_message_required",
    );
  }
  const model = cleanModel(
    options.model || env.ANTHROPIC_MODEL,
    "claude-sonnet-4-6",
  );
  const data = await upstreamJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": String(env.ANTHROPIC_API_KEY),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens(options.maxTokens),
        ...(system ? { system } : {}),
        messages: conversation,
      }),
    },
    "claude",
  );
  const content = Array.isArray(data.content)
    ? data.content
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim()
    : "";
  if (!content)
    throw new HttpError(
      502,
      "Claude returned an empty response.",
      "claude_empty",
    );
  return { provider: "claude", model, content };
}

function openAiText(data) {
  if (typeof data?.output_text === "string") return data.output_text.trim();
  if (!Array.isArray(data?.output)) return "";
  return data.output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part) => part?.type === "output_text" || part?.type === "text")
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

async function runOpenAi(env, messages, options = {}) {
  if (!env.OPENAI_API_KEY)
    throw new HttpError(503, "OpenAI is not configured.", "openai_unavailable");
  const model = cleanModel(options.model || env.OPENAI_MODEL, "gpt-5.4-mini");
  const data = await upstreamJson(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${String(env.OPENAI_API_KEY)}`,
      },
      body: JSON.stringify({
        model,
        input: normalizeMessages(messages),
        max_output_tokens: maxTokens(options.maxTokens),
      }),
    },
    "openai",
  );
  const content = openAiText(data);
  if (!content)
    throw new HttpError(
      502,
      "OpenAI returned an empty response.",
      "openai_empty",
    );
  return { provider: "openai", model, content };
}

async function runGrok(env, messages, options = {}) {
  const key = env.GROK_API_KEY || env.XAI_API_KEY;
  if (!key)
    throw new HttpError(503, "Grok is not configured.", "grok_unavailable");
  const model = cleanModel(options.model || env.GROK_MODEL, "grok-4");
  const data = await upstreamJson(
    "https://api.x.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${String(key)}`,
      },
      body: JSON.stringify({
        model,
        messages: normalizeMessages(messages),
        max_tokens: maxTokens(options.maxTokens),
      }),
    },
    "grok",
  );
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!content)
    throw new HttpError(502, "Grok returned an empty response.", "grok_empty");
  return { provider: "grok", model, content };
}

export async function runExternalProvider(
  env,
  provider,
  messages,
  options = {},
) {
  if (provider === "claude") return runClaude(env, messages, options);
  if (provider === "openai") return runOpenAi(env, messages, options);
  if (provider === "grok") return runGrok(env, messages, options);
  throw new HttpError(400, "Unknown AI provider.", "unknown_provider");
}

export async function runPreferredAi(env, messages, options = {}) {
  const attempts = [];
  const configured = configuredProviders(env);
  const candidates = [
    [
      "workers",
      () =>
        runWorkersAi(env, messages, {
          ...options,
          model: options.workersModel || options.model,
        }),
    ],
    [
      "claude",
      () =>
        runClaude(env, messages, { ...options, model: options.claudeModel }),
    ],
    [
      "openai",
      () =>
        runOpenAi(env, messages, { ...options, model: options.openaiModel }),
    ],
    [
      "grok",
      () => runGrok(env, messages, { ...options, model: options.grokModel }),
    ],
  ];
  for (const [provider, run] of candidates) {
    if (
      (provider === "workers" && !configured.workersAi) ||
      (provider !== "workers" && !configured[provider])
    )
      continue;
    try {
      const result = await run();
      if (attempts.length)
        result.fallback_from = attempts.map((entry) => entry.provider);
      return result;
    } catch (error) {
      attempts.push({
        provider,
        error: safeError(error?.diagnostic || error),
      });
      logEvent("warn", "ai_provider_failed", {
        provider,
        purpose: options.purpose || "request",
        error: safeError(error),
      });
    }
  }
  const error = new HttpError(
    503,
    "No configured AI provider could complete the request.",
    "ai_unavailable",
  );
  error.attempts = attempts;
  throw error;
}

export async function probeAi(env) {
  const started = Date.now();
  try {
    const result = await runPreferredAi(
      env,
      [{ role: "user", content: "Reply with OK." }],
      {
        purpose: "health_probe",
        workersModel: "@cf/meta/llama-3.2-1b-instruct",
        maxTokens: 2,
      },
    );
    return {
      operational: true,
      provider: result.provider,
      latency_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      operational: false,
      error: safeError(error),
      attempts: Array.isArray(error?.attempts)
        ? error.attempts.map((entry) => ({
            provider: String(entry.provider || "unknown"),
            error: safeError(entry.error),
          }))
        : [],
      latency_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  }
}
