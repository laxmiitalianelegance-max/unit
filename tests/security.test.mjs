import assert from "node:assert/strict";
import test from "node:test";

import {
  configuredProviders,
  normalizeMessages,
  runPreferredAi,
  runWorkersAi,
  WORKERS_AI_DEFAULT_MODEL,
} from "../src/ai-providers.js";
import {
  googleOAuthConfigured,
  handleAuth,
  ownerAuthConfigured,
  resolveAccount,
} from "../src/accounts.js";
import { planNativeIntent } from "../src/native-capabilities.js";
import {
  runOwnedModel,
  shouldUseNativeChatFastPath,
} from "../src/owned-inference.js";
import {
  HttpError,
  readJsonLimited,
  requireSameOrigin,
  secureResponse,
} from "../src/runtime-utils.js";
import { ToolStore } from "../src/tool-store.js";
import {
  normalizeLanguage,
  staticTranslation,
} from "../src/ui-translations.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    if (Array.isArray(key)) {
      return new Map(key.map((item) => [item, this.values.get(item)]));
    }
    return this.values.get(key);
  }

  async put(key, value) {
    if (typeof key === "object" && value === undefined) {
      for (const [entryKey, entryValue] of Object.entries(key)) {
        this.values.set(entryKey, structuredClone(entryValue));
      }
      return;
    }
    this.values.set(key, structuredClone(value));
  }

  async delete(key) {
    for (const item of Array.isArray(key) ? key : [key])
      this.values.delete(item);
  }

  async list(options = {}) {
    return new Map(
      [...this.values].filter(([key]) =>
        options.prefix ? key.startsWith(options.prefix) : true,
      ),
    );
  }

  async transaction(callback) {
    return callback(this);
  }
}

function toolStoreNamespace() {
  const stores = new Map();
  return {
    idFromName(name) {
      return String(name);
    },
    get(id) {
      if (!stores.has(id)) {
        stores.set(id, new ToolStore({ storage: new MemoryStorage() }));
      }
      const store = stores.get(id);
      return {
        fetch: (input, init) =>
          store.fetch(
            input instanceof Request ? input : new Request(input, init),
          ),
      };
    },
  };
}

function request(path, body, headers = {}) {
  return new Request(`https://unit.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("bounded JSON reader rejects wrong media types and oversized streams", async () => {
  await assert.rejects(
    readJsonLimited(
      new Request("https://unit.test", { method: "POST", body: "{}" }),
    ),
    (error) => error instanceof HttpError && error.status === 415,
  );

  const oversized = new Request("https://unit.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ value: "x".repeat(500) }),
  });
  await assert.rejects(
    readJsonLimited(oversized, 100),
    (error) => error instanceof HttpError && error.status === 413,
  );
});

test("same-origin protection blocks cross-site writes", () => {
  assert.throws(
    () =>
      requireSameOrigin(
        new Request("https://unit.test/api/write", {
          method: "POST",
          headers: { origin: "https://attacker.test" },
        }),
      ),
    (error) => error instanceof HttpError && error.status === 403,
  );
  assert.doesNotThrow(() =>
    requireSameOrigin(
      new Request("https://unit.test/api/write", {
        method: "POST",
        headers: { origin: "https://unit.test" },
      }),
    ),
  );
});

test("HTML responses receive a nonce-based CSP and security headers", async () => {
  const response = await secureResponse(
    new Response(
      "<style>body{color:white}</style><script>self.ok=true</script>",
      {
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    ),
  );
  const html = await response.text();
  const nonce = html.match(/<script nonce="([^"]+)"/)?.[1];
  assert.ok(nonce);
  assert.ok(html.includes(`<style nonce="${nonce}">`));
  assert.match(
    response.headers.get("content-security-policy"),
    /script-src 'self' 'nonce-/,
  );
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("message and language validation enforce strict limits", () => {
  assert.deepEqual(normalizeMessages([{ role: "user", content: "Hello" }]), [
    { role: "user", content: "Hello" },
  ]);
  assert.throws(() => normalizeMessages([{ role: "tool", content: "bad" }]));
  assert.throws(() =>
    normalizeMessages([{ role: "user", content: "x".repeat(8_001) }]),
  );
  assert.equal(normalizeLanguage("sr-Latn"), "sr-Latn");
  assert.throws(() => normalizeLanguage("sr<script>"));
  assert.equal(staticTranslation("sr-RS").price, "Cena");
});

test("Workers AI uses the quota-efficient production model by default", async () => {
  let invokedModel = "";
  const result = await runWorkersAi(
    {
      AI: {
        async run(model) {
          invokedModel = model;
          return { response: "OK" };
        },
      },
    },
    [{ role: "user", content: "Hello" }],
  );

  assert.equal(invokedModel, WORKERS_AI_DEFAULT_MODEL);
  assert.equal(result.model, WORKERS_AI_DEFAULT_MODEL);
  assert.equal(result.content, "OK");
});

test("owner-controlled inference is preferred through the bounded HTTPS contract", async (t) => {
  t.mock.method(globalThis, "fetch", async (input, init) => {
    assert.equal(
      String(input),
      "https://inference.unit369.example/v1/chat/completions",
    );
    assert.equal(init.method, "POST");
    assert.equal(init.headers.authorization, "Bearer test-owned-token");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "unit369-test-model");
    assert.equal(body.stream, false);
    assert.equal(body.temperature, 0.7);
    assert.equal(body.top_p, 0.8);
    assert.equal(body.presence_penalty, 1.5);
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
    assert.deepEqual(body.messages, [{ role: "user", content: "Hello" }]);
    return Response.json({
      choices: [
        {
          message: {
            content: "<think>Private model reasoning</think>\n\nOwned response",
          },
        },
      ],
    });
  });

  const result = await runPreferredAi(
    {
      UNIT369_INFERENCE_URL:
        "https://inference.unit369.example/v1/chat/completions",
      UNIT369_INFERENCE_MODEL: "unit369-test-model",
      UNIT369_INFERENCE_TOKEN: "test-owned-token",
      UNIT369_INFERENCE_THINKING: "false",
    },
    [{ role: "user", content: "Hello" }],
  );
  assert.equal(result.provider, "unit369-owned");
  assert.equal(result.content, "Owned response");
  assert.equal(result.external_required, false);
});

test("Unit369 RunPod alias resolves to the deployed Hugging Face model", async (t) => {
  t.mock.method(globalThis, "fetch", async (_input, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.model, "Qwen/Qwen3.6-35B-A3B-FP8");
    return Response.json({
      choices: [{ message: { content: "RunPod model is ready." } }],
    });
  });

  const result = await runOwnedModel(
    {
      UNIT369_INFERENCE_URL:
        "https://api.runpod.ai/v2/test/openai/v1/chat/completions",
      UNIT369_INFERENCE_MODEL: "unit369-qwen36",
      UNIT369_INFERENCE_TOKEN: "test-owned-token",
    },
    [{ role: "user", content: "Hello" }],
  );
  assert.equal(result.model, "Qwen/Qwen3.6-35B-A3B-FP8");
  assert.equal(result.content, "RunPod model is ready.");
});

test("short conversational messages use the instant Unit369 Native path", async (t) => {
  let ownedCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    ownedCalled = true;
    return Response.json({
      choices: [{ message: { content: "Slow owned response" } }],
    });
  });

  assert.equal(
    shouldUseNativeChatFastPath([{ role: "user", content: "Šta ima?" }]),
    true,
  );
  assert.equal(
    shouldUseNativeChatFastPath([{ role: "user", content: "." }]),
    true,
  );
  assert.equal(
    shouldUseNativeChatFastPath([
      {
        role: "user",
        content: "Napravi detaljan plan prodaje za sledeći mesec.",
      },
    ]),
    false,
  );

  const result = await runPreferredAi(
    {
      UNIT369_INFERENCE_URL:
        "https://api.runpod.ai/v2/test/openai/v1/chat/completions",
      UNIT369_INFERENCE_MODEL: "unit369-qwen36",
      UNIT369_INFERENCE_TOKEN: "test-owned-token",
    },
    [
      { role: "system", content: "Reply in Serbian." },
      { role: "user", content: "Šta ima?" },
    ],
    { purpose: "chat", externalFallback: false },
  );

  assert.equal(ownedCalled, false);
  assert.equal(result.provider, "unit369-native");
  assert.equal(result.fast_path, true);
  assert.equal(result.content, "Tu sam i radim. Šta želiš da uradim?");
});

test("owned chat failure falls directly back to Unit369 Native when external fallback is disabled", async (t) => {
  let workersAiCalled = false;
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: { message: "The requested model does not exist." } },
      { status: 400 },
    ),
  );

  const result = await runPreferredAi(
    {
      UNIT369_INFERENCE_URL:
        "https://api.runpod.ai/v2/test/openai/v1/chat/completions",
      UNIT369_INFERENCE_MODEL: "unit369-test-model",
      UNIT369_INFERENCE_TOKEN: "test-owned-token",
      AI: {
        async run() {
          workersAiCalled = true;
          return { response: "External response" };
        },
      },
    },
    [
      { role: "system", content: "Reply in Serbian." },
      {
        role: "user",
        content: "Napravi detaljan plan prodaje za sledeći mesec.",
      },
    ],
    { purpose: "chat", externalFallback: false },
  );

  assert.equal(workersAiCalled, false);
  assert.equal(result.provider, "unit369-native");
  assert.match(result.content, /Nativni plan:/);
  assert.deepEqual(result.fallback_from, ["unit369-owned"]);
});

test("owner-controlled inference rejects an unfinished private reasoning block", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({
      choices: [
        { message: { content: "<think>Unfinished private reasoning" } },
      ],
    }),
  );

  await assert.rejects(
    runOwnedModel(
      {
        UNIT369_INFERENCE_URL:
          "https://inference.unit369.example/v1/chat/completions",
        UNIT369_INFERENCE_MODEL: "unit369-test-model",
      },
      [{ role: "user", content: "Hello" }],
    ),
    (error) =>
      error instanceof HttpError && error.code === "owned_inference_empty",
  );
});

test("Unit369 intelligence remains available with every provider removed", async () => {
  const configured = configuredProviders({});
  assert.equal(configured.unit369Native, true);
  assert.equal(configured.unit369Owned, false);
  assert.equal(configured.workersAi, false);
  assert.equal(configured.claude, false);
  assert.equal(configured.openai, false);
  assert.equal(configured.grok, false);

  const result = await runPreferredAi(
    {},
    [{ role: "user", content: "Napravi projekat i dokument" }],
    { purpose: "chat" },
  );
  assert.equal(result.provider, "unit369-native");
  assert.equal(result.external_required, false);
  assert.equal(result.capability_level, "deterministic-foundation");
  assert.ok(result.plan.steps.some((step) => step.capability === "work"));
  assert.ok(result.plan.steps.some((step) => step.capability === "create"));
});

test("native product preparation preserves facts without provider keys", async () => {
  const result = await runPreferredAi(
    {},
    [{ role: "user", content: "Prepare this product" }],
    {
      purpose: "product_prepare",
      nativeContext: {
        title: "Blue Silk Scarf",
        notes: "Customer supplied description only.",
        language: "en",
      },
    },
  );
  const product = JSON.parse(result.content);
  assert.equal(result.provider, "unit369-native");
  assert.equal(product.title, "Blue Silk Scarf");
  assert.equal(product.description, "Customer supplied description only.");
  assert.deepEqual(product.tags, []);
  assert.deepEqual(product.suggestedSizes, []);
  assert.equal(product.skuBase, "BLUE-SILK-SCARF");
});

test("Durable Object quotas block excess requests", async () => {
  const store = new ToolStore({ storage: new MemoryStorage() });
  const first = await store.fetch(
    request("/rate-limit/chat", { windows: [{ window_ms: 60_000, limit: 2 }] }),
  );
  const second = await store.fetch(
    request("/rate-limit/chat", { windows: [{ window_ms: 60_000, limit: 2 }] }),
  );
  const third = await store.fetch(
    request("/rate-limit/chat", { windows: [{ window_ms: 60_000, limit: 2 }] }),
  );
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers.get("retry-after")) >= 1);
});

test("approval tokens are immutable and one-time", async () => {
  const store = new ToolStore({ storage: new MemoryStorage() });
  const createdResponse = await store.fetch(
    request("/approvals", {
      kind: "native-execution",
      action: { message: "Create a project", value: 1 },
    }),
  );
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();

  const consumedResponse = await store.fetch(
    request(`/approvals/${created.id}/consume`, {
      kind: "native-execution",
      token: created.token,
      action: { message: "Changed" },
    }),
  );
  const consumed = await consumedResponse.json();
  assert.equal(consumedResponse.status, 200);
  assert.deepEqual(consumed.action, { message: "Create a project", value: 1 });

  const replay = await store.fetch(
    request(`/approvals/${created.id}/consume`, {
      kind: "native-execution",
      token: created.token,
    }),
  );
  assert.equal(replay.status, 409);
});

test("Google OAuth start binds state to an HttpOnly flow cookie and PKCE", async () => {
  const response = await handleAuth(
    new Request("https://unit.test/api/auth/google/start?return_to=/settings"),
    {
      APP_SECRET: "test-app-secret-with-sufficient-entropy",
      GOOGLE_CLIENT_ID: "unit369-test.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "google-secret-with-sufficient-entropy",
    },
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.searchParams.get("code_challenge_method"), "S256");
  assert.ok(location.searchParams.get("code_challenge"));
  assert.ok(location.searchParams.get("state"));
  assert.match(
    response.headers.get("set-cookie"),
    /__Host-u369_oauth_flow=.*HttpOnly.*Secure.*SameSite=Lax/,
  );
});

test("invalid Google credentials are never sent to Google", async () => {
  const env = {
    APP_SECRET: "test-app-secret-with-sufficient-entropy",
    GOOGLE_CLIENT_ID: "shpss_not_a_google_client_id",
    GOOGLE_CLIENT_SECRET: "not-a-google-client-secret",
  };
  assert.equal(googleOAuthConfigured(env), false);
  const response = await handleAuth(
    new Request("https://unit.test/api/auth/google/start?return_to=/"),
    env,
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("location"), null);
});

test("Unit369 owner access code creates a signed private session", async () => {
  const env = {
    APP_SECRET: "test-app-secret-with-sufficient-entropy",
    UNIT369_OWNER_ACCESS_CODE: "unit369-private-access-code-2026",
    TOOL_STORE: toolStoreNamespace(),
  };
  assert.equal(ownerAuthConfigured(env), true);
  const response = await handleAuth(
    new Request("https://unit.test/api/auth/owner/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
      },
      body: JSON.stringify({
        access_code: "unit369-private-access-code-2026",
      }),
    }),
    env,
  );
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("set-cookie").split(";")[0];
  assert.match(
    response.headers.get("set-cookie"),
    /__Host-u369_account=.*HttpOnly.*Secure.*SameSite=Lax/,
  );
  const account = await resolveAccount(
    new Request("https://unit.test/api/auth/me", { headers: { cookie } }),
    env,
  );
  assert.equal(account.uid, "unit369_owner");
  assert.equal(account.provider, "owner");

  const rejected = await handleAuth(
    new Request("https://unit.test/api/auth/owner/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.10",
      },
      body: JSON.stringify({ access_code: "wrong-access-code" }),
    }),
    env,
  );
  assert.equal(rejected.status, 401);
});

test("native planner identifies independent capability domains", () => {
  const plan = planNativeIntent(
    "Napravi dokument, projekat, proizvod i poruku za kupca",
  );
  for (const capability of ["create", "work", "business", "communicate"]) {
    assert.ok(plan.steps.some((step) => step.capability === capability));
  }
  assert.equal(plan.external_required, false);
});
