import APP_HTML from "./app.html";
import { resolveAccount } from "./accounts.js";
import {
  configuredProviders,
  normalizeMessages,
  probeAi,
  runExternalProvider,
  runPreferredAi,
} from "./ai-providers.js";
import {
  deleteSharedCache,
  enforceQuota,
  getSharedCache,
  putSharedCache,
} from "./state-services.js";
import {
  HttpError,
  errorResponse,
  json,
  logEvent,
  readJsonLimited,
  safeError,
} from "./runtime-utils.js";
import {
  UI_BASE,
  normalizeLanguage,
  staticTranslation,
  validateTranslation,
} from "./ui-translations.js";

export const APP_VERSION = "2026.08.23.5";
const HEALTH_CACHE_KEY = `ai-health-${APP_VERSION}`;
const TRANSLATION_CACHE_VERSION = "ui-v6";

const QUOTAS = Object.freeze({
  chat: [
    { window_ms: 10 * 60 * 1000, limit: 10 },
    { window_ms: 24 * 60 * 60 * 1000, limit: 48 },
  ],
  external: [
    { window_ms: 10 * 60 * 1000, limit: 8 },
    { window_ms: 24 * 60 * 60 * 1000, limit: 36 },
  ],
  synthesis: [
    { window_ms: 10 * 60 * 1000, limit: 5 },
    { window_ms: 24 * 60 * 60 * 1000, limit: 24 },
  ],
  product: [
    { window_ms: 10 * 60 * 1000, limit: 6 },
    { window_ms: 24 * 60 * 60 * 1000, limit: 30 },
  ],
  translation: [
    { window_ms: 60 * 60 * 1000, limit: 4 },
    { window_ms: 24 * 60 * 60 * 1000, limit: 10 },
  ],
});

function cleanJson(text) {
  let value = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) value = value.slice(start, end + 1);
  return JSON.parse(value);
}

async function requireAccount(request, env) {
  const account = await resolveAccount(request, env);
  if (!account) {
    throw new HttpError(
      401,
      "Sign in with Google to continue.",
      "authentication_required",
    );
  }
  return account;
}

function manifest() {
  return {
    id: "/",
    name: "Unit369",
    short_name: "Unit369",
    description: "AI workspace and product management.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#05070c",
    theme_color: "#05070c",
    orientation: "portrait-primary",
    icons: [
      {
        src: `/app-icon-192.png?v=${APP_VERSION}`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: `/app-icon-512.png?v=${APP_VERSION}`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}

function serviceWorker() {
  return `const CACHE='unit369-${APP_VERSION}';
const CORE=['/','/manifest.json','/app-icon-192.png','/app-icon-512.png'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)))});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==location.origin||url.pathname.startsWith('/api/'))return;event.respondWith((async()=>{if(event.request.mode==='navigate'){try{const response=await fetch(event.request,{cache:'no-store'});if(response.ok){const cache=await caches.open(CACHE);await cache.put('/',response.clone())}return response}catch{return(await caches.match('/'))||Response.error()}}const cached=await caches.match(event.request);if(cached)return cached;try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone())}return response}catch{return Response.error()}})())});`;
}

async function asset(env, path) {
  if (!env.ASSETS) return new Response("Not Found", { status: 404 });
  return env.ASSETS.fetch(new Request(`https://unit369.local${path}`));
}

async function freeAi(request, env) {
  const account = await requireAccount(request, env);
  await enforceQuota(env, account.uid, "ai-chat", QUOTAS.chat);
  const body = await readJsonLimited(request, 64 * 1024);
  const messages = normalizeMessages(body.messages);
  const result = await runPreferredAi(env, messages, {
    purpose: "chat",
    maxTokens: 900,
  });
  return json(result);
}

async function aiProxy(request, env) {
  const account = await requireAccount(request, env);
  const body = await readJsonLimited(request, 64 * 1024);
  const provider = String(body.provider || "").toLowerCase();
  if (!new Set(["claude", "openai", "grok"]).has(provider)) {
    throw new HttpError(
      400,
      "Provider must be claude, openai or grok.",
      "invalid_provider",
    );
  }
  await enforceQuota(env, account.uid, `ai-${provider}`, QUOTAS.external);
  const result = await runExternalProvider(
    env,
    provider,
    normalizeMessages(body.messages),
    {
      maxTokens: Math.min(1_200, Number(body.max_tokens) || 900),
      model: body.model,
    },
  );
  return json(result);
}

async function translateUi(request, env) {
  const body = await readJsonLimited(request, 8 * 1024);
  const language = normalizeLanguage(body.target || "en");
  const fixed = staticTranslation(language);
  if (fixed) {
    return json({ d: fixed, language, source: "static", cacheable: true });
  }

  const account = await requireAccount(request, env);
  const cacheKey = `${TRANSLATION_CACHE_VERSION}:${language.toLowerCase()}`;
  const cached = await getSharedCache(env, cacheKey);
  if (cached) {
    try {
      return json({
        d: validateTranslation(cached),
        language,
        source: "cache",
        cacheable: true,
      });
    } catch (error) {
      logEvent("warn", "translation_cache_invalid", {
        language,
        error: safeError(error),
      });
      await deleteSharedCache(env, cacheKey);
    }
  }

  await enforceQuota(env, account.uid, "ui-translation", QUOTAS.translation);
  const result = await runPreferredAi(
    env,
    [
      {
        role: "system",
        content:
          "Return only a valid JSON object. Preserve every key exactly and translate only string values.",
      },
      {
        role: "user",
        content: `Translate this application dictionary naturally into ${language}. Keep Unit369, API, AI, SKU and BCP-47 unchanged. JSON: ${JSON.stringify(UI_BASE)}`,
      },
    ],
    { purpose: "ui_translation", maxTokens: 2_500 },
  );
  const translated = validateTranslation(cleanJson(result.content));
  await putSharedCache(env, cacheKey, translated, 30 * 24 * 60 * 60 * 1000);
  return json({
    d: translated,
    language,
    source: result.provider,
    cacheable: true,
  });
}

async function synthesize(request, env) {
  const account = await requireAccount(request, env);
  await enforceQuota(env, account.uid, "ai-synthesis", QUOTAS.synthesis);
  const body = await readJsonLimited(request, 64 * 1024);
  const question = String(body.question || "").trim();
  if (!question || question.length > 8_000) {
    throw new HttpError(
      400,
      "Question must contain 1-8,000 characters.",
      "invalid_question",
    );
  }
  const sourceAnswers =
    body.answers && typeof body.answers === "object" ? body.answers : {};
  const answers = Object.entries(sourceAnswers)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .slice(0, 4)
    .map(([provider, value]) => [provider, value.trim().slice(0, 8_000)]);
  if (answers.length < 2) {
    throw new HttpError(
      400,
      "At least two answers are required.",
      "insufficient_answers",
    );
  }
  const mode = body.mode === "critique" ? "critique" : "combine";
  const language = normalizeLanguage(body.language || "en");
  const instruction =
    mode === "critique"
      ? "Critically compare the answers, identify disagreements and weaknesses, then give one best final answer."
      : "Combine the strongest parts into one direct final answer without mentioning the models.";
  const result = await runPreferredAi(
    env,
    [
      {
        role: "system",
        content: `You are Unit369. ${instruction} Reply naturally in ${language}.`,
      },
      {
        role: "user",
        content: `Question:\n${question}\n\nAnswers:\n${answers.map(([provider, value]) => `[${provider}]\n${value}`).join("\n\n")}`,
      },
    ],
    { purpose: "synthesis", maxTokens: 1_000 },
  );
  return json(result);
}

async function prepareProduct(request, env) {
  const account = await requireAccount(request, env);
  await enforceQuota(env, account.uid, "ai-product", QUOTAS.product);
  const body = await readJsonLimited(request, 32 * 1024);
  const title = String(body.title || "")
    .trim()
    .slice(0, 300);
  const notes = String(body.notes || "")
    .trim()
    .slice(0, 8_000);
  const language = normalizeLanguage(body.language || "en");
  if (!title && !notes) {
    throw new HttpError(
      400,
      "Provide a product name or notes.",
      "product_input_required",
    );
  }
  const result = await runPreferredAi(
    env,
    [
      {
        role: "system",
        content:
          "You are the Unit369 ecommerce product assistant. Return only valid JSON and never fabricate facts.",
      },
      {
        role: "user",
        content: `Return JSON with keys title, description, productType, tags, suggestedSizes, skuBase. tags and suggestedSizes must be arrays. Never invent material, origin, dimensions, certifications, stock or claims not supplied. Write in ${language}. Raw title: ${title}. Raw notes: ${notes}`,
      },
    ],
    { purpose: "product_prepare", maxTokens: 1_000 },
  );
  const value = cleanJson(result.content);
  return json({
    provider: result.provider,
    draft: {
      title: String(value.title || title).slice(0, 300),
      description: String(value.description || "").slice(0, 8_000),
      productType: String(value.productType || "").slice(0, 160),
      tags: Array.isArray(value.tags)
        ? value.tags.map(String).slice(0, 12)
        : [],
      suggestedSizes: Array.isArray(value.suggestedSizes)
        ? value.suggestedSizes.map(String).slice(0, 20)
        : [],
      skuBase: String(value.skuBase || "").slice(0, 120),
    },
  });
}

function integrationStatus(env) {
  const integrations = configuredProviders(env);
  return {
    version: APP_VERSION,
    core: {
      native: true,
      ai_configured:
        integrations.workersAi ||
        integrations.claude ||
        integrations.openai ||
        integrations.grok,
      authentication_required: true,
      file_storage: env.FILES ? "r2" : "durable_object",
    },
    integrations,
    external_connections: {
      claude: integrations.claude,
      openai: integrations.openai,
      grok: integrations.grok,
      shopify: integrations.shopify,
    },
  };
}

async function healthCheck(name, check) {
  try {
    return (await check()) === true;
  } catch (error) {
    logEvent("warn", "release_health_check_failed", {
      check: name,
      error: safeError(error),
    });
    return false;
  }
}

async function releaseHealth(env) {
  const providers = configuredProviders(env);
  const checks = {
    assets: await healthCheck("assets", async () => {
      if (!env.ASSETS) return false;
      const response = await env.ASSETS.fetch(
        new Request("https://unit369.local/unit369-192.png"),
      );
      await response.body?.cancel();
      return response.ok;
    }),
    self: await healthCheck("self", async () => {
      if (!env.SELF) return false;
      const response = await env.SELF.fetch(
        new Request("https://unit369.local/api/status"),
      );
      await response.body?.cancel();
      return response.ok;
    }),
    native_store: await healthCheck("native_store", async () => {
      if (!env.NATIVE_STORE) return false;
      const stub = env.NATIVE_STORE.get(
        env.NATIVE_STORE.idFromName("__unit369_health__"),
      );
      const response = await stub.fetch(
        "https://native.internal/native-store/data/collections?limit=1",
      );
      await response.body?.cancel();
      return response.ok;
    }),
    tool_store: await healthCheck("tool_store", async () => {
      if (!env.TOOL_STORE) return false;
      await getSharedCache(env, "release-health-binding-check");
      return true;
    }),
    files: await healthCheck("files", async () => {
      if (env.FILES) {
        await env.FILES.list({ limit: 1 });
        return true;
      }
      if (!env.NATIVE_STORE) return false;
      const stub = env.NATIVE_STORE.get(
        env.NATIVE_STORE.idFromName("__unit369_file_health__"),
      );
      const response = await stub.fetch(
        "https://native.internal/native-store/files?limit=1",
      );
      await response.body?.cancel();
      return response.ok;
    }),
    app_secret: !!env.APP_SECRET,
    encryption_key: !!env.ENCRYPTION_KEY,
    google_oauth: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    ai_configured:
      providers.workersAi ||
      providers.claude ||
      providers.openai ||
      providers.grok,
  };
  const configured = Object.values(checks).every(Boolean);
  let ai = null;
  if (checks.ai_configured) {
    try {
      ai = await getSharedCache(env, HEALTH_CACHE_KEY);
      const checkedAt = Date.parse(ai?.checked_at || "");
      if (
        !ai ||
        typeof ai !== "object" ||
        typeof ai.operational !== "boolean" ||
        !Number.isFinite(checkedAt) ||
        Date.now() - checkedAt > 5 * 60 * 1000
      ) {
        ai = null;
      }
    } catch (error) {
      logEvent("warn", "health_cache_read_failed", { error: safeError(error) });
    }
    if (!ai) {
      ai = await probeAi(env);
      try {
        await putSharedCache(env, HEALTH_CACHE_KEY, ai, 4 * 60 * 1000);
      } catch (error) {
        logEvent("warn", "health_cache_write_failed", {
          error: safeError(error),
        });
      }
    }
  }
  const operational = configured && ai?.operational === true;
  return {
    status: operational ? "ready" : "not_ready",
    version: APP_VERSION,
    core_ready: operational,
    auth_ready: checks.google_oauth,
    ai_operational: ai?.operational === true,
    ai: ai || { operational: false, error: "No AI provider is configured." },
    file_storage: env.FILES ? "r2" : "durable_object",
    checks,
  };
}

function serveApp() {
  return new Response(APP_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (
        (url.pathname === "/" || url.pathname === "/app") &&
        request.method === "GET"
      )
        return serveApp();
      if (url.pathname === "/api/status" && request.method === "GET")
        return json(integrationStatus(env));
      if (url.pathname === "/api/health/release" && request.method === "GET") {
        const health = await releaseHealth(env);
        return json(health, health.core_ready ? 200 : 503);
      }
      if (url.pathname === "/api/free-ai" && request.method === "POST")
        return freeAi(request, env);
      if (url.pathname === "/api/ai-proxy" && request.method === "POST")
        return aiProxy(request, env);
      if (url.pathname === "/api/ui-i18n" && request.method === "POST")
        return translateUi(request, env);
      if (url.pathname === "/api/team-synthesize" && request.method === "POST")
        return synthesize(request, env);
      if (url.pathname === "/api/product-prepare" && request.method === "POST")
        return prepareProduct(request, env);
      if (url.pathname === "/manifest.json" && request.method === "GET") {
        return new Response(JSON.stringify(manifest()), {
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "no-cache",
          },
        });
      }
      if (url.pathname === "/sw.js" && request.method === "GET") {
        return new Response(serviceWorker(), {
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "no-cache",
            "service-worker-allowed": "/",
          },
        });
      }
      if (["/app-icon-192.png", "/app-icon-192.jpg"].includes(url.pathname)) {
        return asset(env, "/unit369-192.png");
      }
      if (["/app-icon-512.png", "/app-icon-512.jpg"].includes(url.pathname)) {
        return asset(env, "/unit369-512.png");
      }
      if (env.ASSETS && request.method === "GET") {
        const response = await env.ASSETS.fetch(request);
        if (response.status !== 404) return response;
      }
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      return errorResponse(error, {
        path: url.pathname,
        method: request.method,
      });
    }
  },
};
