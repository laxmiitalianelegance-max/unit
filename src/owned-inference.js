import { planNativeIntent } from "./native-capabilities.js";
import {
  HttpError,
  logEvent,
  readResponseJsonLimited,
  safeError,
} from "./runtime-utils.js";

const OWNED_TIMEOUT_MS = 10_000;
const MAX_OWNED_RESPONSE_BYTES = 768 * 1024;
export const UNIT369_NATIVE_MODEL = "unit369-native-foundation-v1";
export const UNIT369_OWNED_DEFAULT_MODEL = "Qwen/Qwen3.6-35B-A3B-FP8";

const KNOWN_MODEL_ALIASES = Object.freeze({
  "unit369-qwen36": UNIT369_OWNED_DEFAULT_MODEL,
});

function optionalBoolean(value) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
}

function cleanModel(value, fallback = UNIT369_OWNED_DEFAULT_MODEL) {
  const model = String(value || "").trim();
  return /^[A-Za-z0-9@._:/-]{1,120}$/.test(model) ? model : fallback;
}

function ownedModel(value) {
  const configured = cleanModel(value);
  return KNOWN_MODEL_ALIASES[configured.toLowerCase()] || configured;
}

function ownedEndpoint(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new HttpError(
      503,
      "Unit369 owned inference endpoint is invalid.",
      "owned_inference_invalid_url",
    );
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new HttpError(
      503,
      "Unit369 owned inference endpoint must use HTTPS without URL credentials.",
      "owned_inference_insecure_url",
    );
  }
  return url.toString();
}

function userMessage(messages) {
  return (
    [...messages].reverse().find((message) => message?.role === "user")
      ?.content || ""
  );
}

export function shouldUseNativeChatFastPath(messages) {
  const request = userMessage(messages).replace(/\s+/g, " ").trim();
  if (!request || /^[.?!…]+$/.test(request)) return true;
  if (request.length > 80) return false;
  return /^(?:(?:ć|c)ao|zdravo|hej|pozdrav|hello|hi|hey|sta ima|šta ima|tu si|jesi tu|jel si tu|radiš|radis|radi li|hvala|thanks|thank you)[?.!…]*$/i.test(
    request,
  );
}

function usesSerbian(messages, context = {}) {
  const language = String(context.language || "").toLowerCase();
  if (language === "sr" || language.startsWith("sr-")) return true;
  return messages.some((message) =>
    /\bserbian\b|\bsr-(?:latn|cyrl)\b|[čćžšđ]|\b(?:napravi|uradi|projekat|zadatak|poruka|proizvod|pomozi|možeš|mozes|sta ima|tu si|jesi tu|jel si tu|radis)\b/i.test(
      String(message?.content || ""),
    ),
  );
}

function nativeChat(messages, context) {
  const request = userMessage(messages).replace(/\s+/g, " ").trim();
  const serbian = usesSerbian(messages, context);
  if (
    !request ||
    /^[.?!…]+$/.test(request) ||
    /^(?:(?:ć|c)ao|zdravo|hej|sta ima|šta ima|tu si|jesi tu)[?.!…]*$/i.test(
      request,
    )
  ) {
    return {
      content: serbian
        ? "Tu sam i radim. Šta želiš da uradim?"
        : "I'm here and ready. What would you like me to do?",
    };
  }
  const plan = planNativeIntent(request);
  const numbered = plan.steps
    .map(
      (step, index) =>
        `${index + 1}. ${step.reason} (${step.capability}.${step.operation})`,
    )
    .join("\n");
  const content = serbian
    ? [
        "Unit369 Native radi bez Cloudflare AI, Claude, OpenAI ili Grok servisa.",
        request
          ? `Razumeo sam zahtev: ${request.slice(0, 700)}`
          : "Zahtev je primljen.",
        "Nativni plan:",
        numbered,
        "Ovo je deterministički osnovni režim: može samostalno da planira i koristi Unit369 podatke, fajlove i alate. Slobodno generativno rezonovanje biće potpuno nezavisno kada se priključi Unit369 model preko owned-inference ugovora.",
      ].join("\n\n")
    : [
        "Unit369 Native is running without Cloudflare AI, Claude, OpenAI or Grok.",
        request
          ? `I understood the request: ${request.slice(0, 700)}`
          : "The request was received.",
        "Native plan:",
        numbered,
        "This is the deterministic foundation mode: it can plan and use Unit369 data, files and tools independently. Unrestricted generative reasoning becomes fully independent when the Unit369 model is attached through the owned-inference contract.",
      ].join("\n\n");
  return { content, plan };
}

function safeSku(title) {
  return String(title || "UNIT369")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function nativeProduct(context) {
  const title = String(context.title || "")
    .trim()
    .slice(0, 300);
  const notes = String(context.notes || "")
    .trim()
    .slice(0, 8_000);
  return JSON.stringify({
    title,
    description: notes,
    productType: "",
    tags: [],
    suggestedSizes: [],
    skuBase: safeSku(title),
  });
}

function nativeSynthesis(messages, context) {
  const entries = Array.isArray(context.answers)
    ? context.answers
    : Object.entries(context.answers || {});
  const serbian = usesSerbian(messages, context);
  const heading = serbian
    ? "Deterministički Unit369 pregled dostavljenih odgovora:"
    : "Deterministic Unit369 review of the supplied answers:";
  const body = entries
    .slice(0, 4)
    .map(
      ([provider, value], index) =>
        `${index + 1}. ${String(provider).slice(0, 60)}\n${String(value).trim().slice(0, 2_500)}`,
    )
    .join("\n\n");
  const note = serbian
    ? "Ovaj režim ne izmišlja zajednički zaključak: prikazuje izvore za proveru dok Unit369-owned generativni model nije priključen."
    : "This mode does not invent a combined conclusion: it preserves the sources for review until the Unit369-owned generative model is attached.";
  return [heading, body, note].filter(Boolean).join("\n\n");
}

export function ownedInferenceConfiguration(env = {}) {
  const thinking = optionalBoolean(env.UNIT369_INFERENCE_THINKING);
  return {
    native: true,
    endpoint_configured: !!String(env.UNIT369_INFERENCE_URL || "").trim(),
    model: ownedModel(env.UNIT369_INFERENCE_MODEL),
    ...(thinking === undefined ? {} : { thinking }),
  };
}

export function runNativeIntelligence(messages, options = {}) {
  const purpose = String(options.purpose || "chat");
  const context = options.nativeContext || {};
  let content;
  let plan;

  if (purpose === "health_probe") {
    content = "OK";
  } else if (purpose === "product_prepare") {
    content = nativeProduct(context);
  } else if (purpose === "synthesis") {
    content = nativeSynthesis(messages, context);
  } else if (purpose === "ui_translation") {
    throw new HttpError(
      503,
      "This language still requires a generative translation model.",
      "native_translation_pending",
    );
  } else {
    const result = nativeChat(messages, context);
    content = result.content;
    plan = result.plan;
  }

  return {
    provider: "unit369-native",
    model: UNIT369_NATIVE_MODEL,
    capability_level: "deterministic-foundation",
    external_required: false,
    content,
    ...(plan ? { plan } : {}),
  };
}

function ownedText(data) {
  const chat = data?.choices?.[0]?.message?.content;
  const raw =
    typeof chat === "string"
      ? chat
      : typeof data?.response === "string"
        ? data.response
        : typeof data?.output_text === "string"
          ? data.output_text
          : "";
  const text = raw.trim();
  if (!text) return "";
  let finalText = text;
  while (/^<think>/i.test(finalText)) {
    const closingTag = finalText.search(/<\/think>/i);
    if (closingTag < 0) return "";
    finalText = finalText.slice(closingTag + "</think>".length).trim();
  }
  return finalText;
}

export async function runOwnedModel(env, messages, options = {}) {
  if (!env.UNIT369_INFERENCE_URL) {
    throw new HttpError(
      503,
      "Unit369 owned inference is not configured.",
      "owned_inference_unavailable",
    );
  }
  const endpoint = ownedEndpoint(env.UNIT369_INFERENCE_URL);
  const model = ownedModel(options.model || env.UNIT369_INFERENCE_MODEL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OWNED_TIMEOUT_MS);
  try {
    const token = String(env.UNIT369_INFERENCE_TOKEN || "").trim();
    const thinking = optionalBoolean(env.UNIT369_INFERENCE_THINKING);
    const sampling =
      thinking === false
        ? { temperature: 0.7, top_p: 0.8, presence_penalty: 1.5 }
        : {};
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: Math.max(
          1,
          Math.min(2_500, Number(options.maxTokens) || 900),
        ),
        stream: false,
        ...sampling,
        ...(thinking === undefined
          ? {}
          : { chat_template_kwargs: { enable_thinking: thinking } }),
      }),
      signal: controller.signal,
    });
    const data = await readResponseJsonLimited(
      response,
      MAX_OWNED_RESPONSE_BYTES,
    );
    if (!response.ok) {
      const detail = String(
        data?.error?.message ||
          data?.error ||
          data?.message ||
          `HTTP ${response.status}`,
      ).slice(0, 500);
      logEvent("warn", "owned_inference_rejected", {
        status: response.status,
        detail,
      });
      const error = new HttpError(
        response.status === 429 ? 429 : 502,
        response.status === 429
          ? "Unit369 owned inference limit reached."
          : "Unit369 owned inference request failed.",
        response.status === 429
          ? "owned_inference_rate_limited"
          : "owned_inference_upstream_error",
      );
      error.diagnostic = `HTTP ${response.status}: ${detail}`;
      throw error;
    }
    const content = ownedText(data);
    if (!content) {
      throw new HttpError(
        502,
        "Unit369 owned inference returned an empty response.",
        "owned_inference_empty",
      );
    }
    return {
      provider: "unit369-owned",
      model,
      capability_level: "generative-model",
      external_required: false,
      content,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new HttpError(
        504,
        "Unit369 owned inference request timed out.",
        "owned_inference_timeout",
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeNativeIntelligence() {
  const started = Date.now();
  try {
    const result = runNativeIntelligence(
      [{ role: "user", content: "Reply with OK." }],
      { purpose: "health_probe" },
    );
    return {
      operational: result.content === "OK",
      provider: result.provider,
      model: result.model,
      capability_level: result.capability_level,
      external_required: false,
      latency_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      operational: false,
      error: safeError(error),
      latency_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  }
}
