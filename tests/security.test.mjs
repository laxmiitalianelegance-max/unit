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
  codeExecutionCapabilities,
  handleNativeCodeExecution,
  isCodeChatCommand,
  normalizeCodeRequest,
  normalizeExecutionResult,
  parseCodeChatCommand,
} from "../src/native-code-execution.js";
import { handleNativeBuild } from "../src/native-build.js";
import {
  createDataLabManifest,
  DATA_LAB_COMMAND,
  dataLabCapabilities,
  handleDataLabExecution,
  normalizeDataLabImport,
  normalizeDataLabRequest,
  normalizeDataLabReport,
} from "../src/native-data-lab.js";
import {
  createProjectManifest,
  handleProjectExecution,
  inspectProjectDependencies,
  normalizeProjectExecutionRequest,
  normalizeProjectImport,
  normalizeWorkspacePath,
  projectExecutionCapabilities,
} from "../src/native-project-execution.js";
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
  UI_BASE,
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
  assert.deepEqual(
    Object.keys(staticTranslation("sr-RS")).sort(),
    Object.keys(UI_BASE).sort(),
  );
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
    shouldUseNativeChatFastPath([{ role: "user", content: "Jesi cuo?" }]),
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

test("Serbian hearing check gets an immediate natural response", async (t) => {
  let ownedCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    ownedCalled = true;
    return Response.json({
      choices: [{ message: { content: "Slow owned response" } }],
    });
  });

  const result = await runPreferredAi(
    {
      UNIT369_INFERENCE_URL:
        "https://api.runpod.ai/v2/test/openai/v1/chat/completions",
      UNIT369_INFERENCE_MODEL: "unit369-qwen36",
      UNIT369_INFERENCE_TOKEN: "test-owned-token",
    },
    [{ role: "user", content: "Jesi cuo?" }],
    { purpose: "chat", externalFallback: false },
  );

  assert.equal(ownedCalled, false);
  assert.equal(result.provider, "unit369-native");
  assert.equal(result.fast_path, true);
  assert.equal(result.content, "Jesam. Reci šta treba.");
});

test("Serbian requests for help get an immediate useful response", async (t) => {
  let ownedCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    ownedCalled = true;
    return Response.json({
      choices: [{ message: { content: "Slow owned response" } }],
    });
  });

  for (const message of [
    "Treba mi pomoć",
    "Pomozi mi.",
    "Možeš li da mi pomogneš?",
  ]) {
    assert.equal(
      shouldUseNativeChatFastPath([{ role: "user", content: message }]),
      true,
    );
  }

  const result = await runPreferredAi(
    {
      UNIT369_INFERENCE_URL:
        "https://api.runpod.ai/v2/test/openai/v1/chat/completions",
      UNIT369_INFERENCE_MODEL: "unit369-qwen36",
      UNIT369_INFERENCE_TOKEN: "test-owned-token",
    },
    [{ role: "user", content: "Treba mi pomoc" }],
    { purpose: "chat", externalFallback: false },
  );

  assert.equal(ownedCalled, false);
  assert.equal(result.provider, "unit369-native");
  assert.equal(result.fast_path, true);
  assert.equal(
    result.content,
    "Naravno. Reci mi konkretno šta treba da rešimo.",
  );
});

test("Serbian question openers get an immediate natural response", async (t) => {
  let ownedCalled = false;
  t.mock.method(globalThis, "fetch", async () => {
    ownedCalled = true;
    return Response.json({
      choices: [{ message: { content: "Slow owned response" } }],
    });
  });

  const result = await runPreferredAi(
    {
      UNIT369_INFERENCE_URL:
        "https://api.runpod.ai/v2/test/openai/v1/chat/completions",
      UNIT369_INFERENCE_MODEL: "unit369-qwen36",
      UNIT369_INFERENCE_TOKEN: "test-owned-token",
    },
    [{ role: "user", content: "Imam pitanje" }],
    { purpose: "chat", externalFallback: false },
  );

  assert.equal(ownedCalled, false);
  assert.equal(result.provider, "unit369-native");
  assert.equal(result.fast_path, true);
  assert.equal(result.content, "Slobodno, pitaj.");
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
  assert.match(result.content, /Glavni model se trenutno pokreće/);
  assert.doesNotMatch(
    result.content,
    /Cloudflare|Claude|OpenAI|Grok|owned-inference|intelligence\.plan|Nativni plan/i,
  );
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

test("isolated code requests enforce language, size, and timeout boundaries", () => {
  assert.deepEqual(
    normalizeCodeRequest({
      language: "PYTHON",
      code: "print(2 + 2)",
      timeout_ms: 90_000,
    }),
    {
      language: "python",
      code: "print(2 + 2)",
      timeout_ms: 30_000,
    },
  );
  assert.throws(
    () => normalizeCodeRequest({ language: "bash", code: "echo unsafe" }),
    (error) =>
      error instanceof HttpError && error.code === "unsupported_code_language",
  );
  assert.throws(
    () =>
      normalizeCodeRequest({ language: "python", code: "x".repeat(32_001) }),
    (error) => error instanceof HttpError && error.status === 413,
  );
  const capabilities = codeExecutionCapabilities(true);
  assert.equal(capabilities.configured, true);
  assert.equal(capabilities.arbitrary_shell_enabled, false);
  assert.equal(capabilities.secrets_forwarded, false);
});

test("isolated execution output is bounded and marks untrusted HTML", () => {
  const result = normalizeExecutionResult({
    executionCount: 3,
    logs: { stdout: ["ok"], stderr: [] },
    results: [{ text: "4", html: "<script>bad()</script>" }],
  });
  assert.equal(result.status, "completed");
  assert.equal(result.execution_count, 3);
  assert.deepEqual(result.logs.stdout, ["ok"]);
  assert.equal(result.results[0].text, "4");
  assert.equal(result.results[0].html_is_untrusted, true);
});

test("chat code commands require an explicit slash command and supported language", () => {
  assert.equal(isCodeChatCommand("/run python\nprint(4)"), true);
  assert.equal(isCodeChatCommand("please review this code"), false);
  assert.deepEqual(parseCodeChatCommand("/run py\nprint(2 + 2)"), {
    language: "python",
    code: "print(2 + 2)",
    timeout_ms: 15_000,
  });
  assert.deepEqual(
    parseCodeChatCommand("/izvrši\n```typescript\nconsole.log(4)\n```"),
    {
      language: "typescript",
      code: "console.log(4)",
      timeout_ms: 15_000,
    },
  );
  assert.throws(
    () => parseCodeChatCommand("```python\nprint(4)\n```"),
    (error) =>
      error instanceof HttpError && error.code === "invalid_code_chat_command",
  );
  assert.throws(
    () => parseCodeChatCommand("/run python\n```javascript\nalert(1)\n```"),
    (error) =>
      error instanceof HttpError && error.code === "code_language_mismatch",
  );
  assert.throws(
    () => parseCodeChatCommand("/run\n```ruby\nputs 4\n```"),
    (error) =>
      error instanceof HttpError && error.code === "unsupported_code_language",
  );
});

test("isolated code executes only after immutable one-time approval", async () => {
  const calls = [];
  const env = {
    UNIT369_SANDBOX: {},
    TOOL_STORE: toolStoreNamespace(),
  };
  const runtime = {
    getSandbox(_binding, id, options) {
      calls.push({ type: "sandbox", id, options });
      return {
        async runCode(code, runOptions) {
          calls.push({ type: "run", code, runOptions });
          return {
            executionCount: 1,
            logs: { stdout: ["4"], stderr: [] },
            results: [{ text: "4" }],
          };
        },
      };
    },
  };
  const account = { uid: "owner-test" };
  const plannedResponse = await handleNativeCodeExecution(
    request("/api/native/code/plan", {
      language: "python",
      code: "print(2 + 2)",
      timeout_ms: 5_000,
    }),
    env,
    account,
    runtime,
  );
  assert.equal(plannedResponse.status, 202);
  const planned = await plannedResponse.json();
  assert.equal(planned.approval_required, true);
  assert.equal(calls.length, 0);

  const confirmedResponse = await handleNativeCodeExecution(
    request("/api/native/code/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
  );
  assert.equal(
    confirmedResponse.status,
    200,
    await confirmedResponse.clone().text(),
  );
  const confirmed = await confirmedResponse.json();
  assert.equal(confirmed.status, "completed");
  assert.deepEqual(confirmed.logs.stdout, ["4"]);
  assert.equal(calls.filter((entry) => entry.type === "run").length, 1);
  assert.equal(calls[1].runOptions.language, "python");
  assert.equal(calls[1].runOptions.timeout, 5_000);

  const replayResponse = await handleNativeCodeExecution(
    request("/api/native/code/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
  );
  assert.equal(replayResponse.status, 409);
  assert.equal(calls.filter((entry) => entry.type === "run").length, 1);
});

test("chat execution approvals can be cancelled and never executed", async () => {
  const calls = [];
  const env = {
    UNIT369_SANDBOX: {},
    TOOL_STORE: toolStoreNamespace(),
  };
  const runtime = {
    getSandbox() {
      return {
        async runCode() {
          calls.push("run");
          return { logs: { stdout: [], stderr: [] }, results: [] };
        },
      };
    },
  };
  const account = { uid: "owner-cancel" };
  const plannedResponse = await handleNativeCodeExecution(
    request("/api/native/code/plan", {
      message: "/run javascript\nconsole.log('never')",
    }),
    env,
    account,
    runtime,
  );
  assert.equal(plannedResponse.status, 202);
  const planned = await plannedResponse.json();
  assert.equal(planned.execution.language, "javascript");

  const cancelledResponse = await handleNativeCodeExecution(
    request("/api/native/code/cancel", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
  );
  assert.equal(cancelledResponse.status, 200);
  assert.deepEqual(await cancelledResponse.json(), { cancelled: true });

  const confirmedResponse = await handleNativeCodeExecution(
    request("/api/native/code/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
  );
  assert.equal(confirmedResponse.status, 409);
  assert.deepEqual(calls, []);
});

test("project imports enforce safe paths, text limits, and dependency allowlists", async () => {
  const imported = normalizeProjectImport({
    name: "Example",
    files: [
      { path: "main.py", content: "import numpy as np\nprint(np.sum([1, 2]))" },
      { path: "requirements.txt", content: "numpy==2.3.2\npandas>=2" },
    ],
  });
  assert.equal(imported.name, "Example");
  assert.equal(imported.files.length, 2);
  assert.ok(imported.total_bytes > 0);
  assert.equal(normalizeWorkspacePath("src/main file.js"), "src/main file.js");
  assert.throws(
    () => normalizeWorkspacePath("../secret.env"),
    (error) =>
      error instanceof HttpError && error.code === "invalid_workspace_path",
  );
  assert.throws(
    () =>
      normalizeProjectImport({
        files: [
          { path: "same.py", content: "print(1)" },
          { path: "SAME.py", content: "print(2)" },
        ],
      }),
    (error) =>
      error instanceof HttpError && error.code === "duplicate_project_path",
  );
  assert.deepEqual(
    inspectProjectDependencies(imported.files).map((item) => item.name),
    ["numpy", "pandas"],
  );
  assert.throws(
    () =>
      inspectProjectDependencies([
        {
          path: "package.json",
          content: JSON.stringify({ dependencies: { express: "5.1.0" } }),
        },
      ]),
    (error) =>
      error instanceof HttpError && error.code === "dependency_not_allowed",
  );

  const first = await createProjectManifest(imported.files);
  const second = await createProjectManifest([...imported.files].reverse());
  assert.equal(first.digest, second.digest);
  assert.equal(first.file_count, 2);
});

test("project execution supports only bounded server-defined operations", () => {
  const python = [{ path: "main.py", content: "print('ok')" }];
  const run = normalizeProjectExecutionRequest(
    { operation: "run", timeout_ms: 90_000 },
    python,
  );
  assert.equal(run.language, "python");
  assert.equal(run.entrypoint, "main.py");
  assert.equal(run.timeout_ms, 30_000);
  assert.equal(run.command, "python3 -B 'main.py'");
  const check = normalizeProjectExecutionRequest({ operation: "check" }, [
    { path: "src/index.js", content: "console.log('ok')" },
  ]);
  assert.equal(check.command_label, "JavaScript syntax check");
  assert.throws(
    () => normalizeProjectExecutionRequest({ operation: "shell" }, python),
    (error) =>
      error instanceof HttpError && error.code === "invalid_project_operation",
  );
  assert.throws(
    () =>
      normalizeProjectExecutionRequest({ operation: "check" }, [
        { path: "main.py", content: "print(1)" },
        { path: "index.js", content: "console.log(1)" },
      ]),
    (error) =>
      error instanceof HttpError &&
      error.code === "mixed_project_not_supported",
  );
  const capabilities = projectExecutionCapabilities(true);
  assert.equal(capabilities.configured, true);
  assert.equal(capabilities.arbitrary_shell_enabled, false);
  assert.equal(capabilities.dependency_installation_enabled, false);
  assert.equal(capabilities.secrets_forwarded, false);
});

test("workspace metadata remains editable while execution artifacts stay read-only", async () => {
  const calls = [];
  const nativeStore = {
    idFromName(value) {
      return String(value);
    },
    get() {
      return {
        async fetch(input) {
          const storeRequest =
              input instanceof Request ? input : new Request(input),
            url = new URL(storeRequest.url),
            path = url.pathname.replace(/^\/native-store/, "");
          calls.push({ method: storeRequest.method, path });
          if (storeRequest.method === "GET" && path === "/data/collections") {
            return Response.json({
              collections: [{ id: "c_build", name: "__unit369_build_v1" }],
            });
          }
          if (
            storeRequest.method === "GET" &&
            path === "/data/collections/c_build/records/ws_1"
          ) {
            return Response.json({
              record: {
                id: "ws_1",
                name: "Workspace",
                data: { type: "workspace", name: "Workspace" },
              },
            });
          }
          if (
            storeRequest.method === "PUT" &&
            path === "/data/collections/c_build/records/ws_1"
          ) {
            return Response.json({ ok: true, updated_at: Date.now() });
          }
          if (storeRequest.method === "GET" && path === "/files/f_artifact") {
            return Response.json({
              file: {
                id: "f_artifact",
                parent_id: "ws_1",
                name: "artifacts/run/result.txt",
                mime: "text/plain",
                body: "cmVzdWx0",
                meta: { kind: "artifact", encoding: "base64" },
              },
            });
          }
          return Response.json(
            { error: "Unexpected store request." },
            {
              status: 500,
            },
          );
        },
      };
    },
  };
  const env = { NATIVE_STORE: nativeStore };
  const account = { uid: "owner-build" };
  const updated = await handleNativeBuild(
    new Request("https://unit.test/api/native/build/ws_1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated workspace" }),
    }),
    env,
    account,
  );
  assert.equal(updated.status, 200, await updated.clone().text());
  assert.equal((await updated.json()).workspace.name, "Updated workspace");

  for (const method of ["PUT", "DELETE"]) {
    const artifactRequest = new Request(
      "https://unit.test/api/native/build/ws_1/files/f_artifact",
      {
        method,
        headers: { "content-type": "application/json" },
        ...(method === "PUT"
          ? { body: JSON.stringify({ content: "changed" }) }
          : {}),
      },
    );
    const response = await handleNativeBuild(artifactRequest, env, account);
    assert.equal(response.status, 409, await response.clone().text());
  }
  assert.equal(
    calls.filter(
      (entry) => entry.path === "/files/f_artifact" && entry.method !== "GET",
    ).length,
    0,
  );
});

test("multi-file projects execute only after immutable one-time approval", async () => {
  const calls = [];
  const persisted = [];
  let outputDirectory = "";
  const sources = [
    {
      path: "src/helper.py",
      content: "def value(): return 9",
      mime: "text/x-python",
    },
    {
      path: "main.py",
      content: "from src.helper import value\nprint(value())",
      mime: "text/x-python",
    },
  ];
  const env = {
    UNIT369_SANDBOX: {},
    TOOL_STORE: toolStoreNamespace(),
  };
  const services = {
    workspaceName: "Approved project",
    async readSourceFiles() {
      return sources;
    },
    async persistArtifact(artifact) {
      persisted.push(artifact);
      return {
        id: "f_artifact",
        path: artifact.path,
        mime: artifact.mime,
        size: artifact.size,
        encoding: artifact.encoding,
      };
    },
  };
  const runtime = {
    getSandbox(_binding, id, options) {
      calls.push({ type: "sandbox", id, options });
      return {
        async mkdir(path) {
          calls.push({ type: "mkdir", path });
          if (path.endsWith("/output")) outputDirectory = path;
          return { success: true };
        },
        async writeFile(path, content, options) {
          calls.push({ type: "write", path, content, options });
          return { success: true };
        },
        async exec(command, options) {
          calls.push({ type: "exec", command, options });
          assert.deepEqual(Object.keys(options.env).sort(), [
            "NO_COLOR",
            "PYTHONDONTWRITEBYTECODE",
            "UNIT369_OUTPUT_DIR",
          ]);
          return {
            success: true,
            exitCode: 0,
            stdout: "9\n",
            stderr: "",
          };
        },
        async listFiles(path) {
          assert.equal(path, outputDirectory);
          return {
            files: [
              {
                type: "file",
                relativePath: "result.txt",
                absolutePath: `${outputDirectory}/result.txt`,
                size: 2,
              },
            ],
          };
        },
        async readFile(path, options) {
          assert.equal(path, `${outputDirectory}/result.txt`);
          assert.deepEqual(options, { encoding: "base64" });
          return {
            content: "OQo=",
            mimeType: "text/plain",
          };
        },
        async destroy() {
          calls.push({ type: "destroy" });
        },
      };
    },
  };
  const account = { uid: "owner-project" };
  const plannedResponse = await handleProjectExecution(
    request("/api/native/build/ws_1/executions/plan", {
      operation: "run",
    }),
    env,
    account,
    runtime,
    services,
    "ws_1",
    "plan",
  );
  assert.equal(plannedResponse.status, 202);
  const planned = await plannedResponse.json();
  assert.equal(planned.approval_required, true);
  assert.equal(planned.execution.file_count, 2);
  assert.equal(calls.length, 0);

  const confirmedResponse = await handleProjectExecution(
    request("/api/native/build/ws_1/executions/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
    services,
    "ws_1",
    "confirm",
  );
  assert.equal(
    confirmedResponse.status,
    200,
    await confirmedResponse.clone().text(),
  );
  const confirmed = await confirmedResponse.json();
  assert.equal(confirmed.status, "completed");
  assert.deepEqual(confirmed.logs.stdout, ["9"]);
  assert.equal(confirmed.artifacts[0].id, "f_artifact");
  assert.equal(persisted[0].content, "OQo=");
  assert.equal(calls.filter((entry) => entry.type === "exec").length, 1);
  assert.equal(calls.at(-1).type, "destroy");

  const replayResponse = await handleProjectExecution(
    request("/api/native/build/ws_1/executions/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
    services,
    "ws_1",
    "confirm",
  );
  assert.equal(replayResponse.status, 409);
  assert.equal(calls.filter((entry) => entry.type === "exec").length, 1);
});

test("project approval fails closed when any workspace file changes", async () => {
  let source = "print(1)";
  let sandboxCalls = 0;
  const env = {
    UNIT369_SANDBOX: {},
    TOOL_STORE: toolStoreNamespace(),
  };
  const services = {
    workspaceName: "Changing project",
    async readSourceFiles() {
      return [{ path: "main.py", content: source }];
    },
    async persistArtifact() {
      throw new Error("should not persist");
    },
  };
  const runtime = {
    getSandbox() {
      sandboxCalls += 1;
      throw new Error("should not execute");
    },
  };
  const account = { uid: "owner-changing-project" };
  const plannedResponse = await handleProjectExecution(
    request("/api/native/build/ws_2/executions/plan", {
      operation: "run",
    }),
    env,
    account,
    runtime,
    services,
    "ws_2",
    "plan",
  );
  const planned = await plannedResponse.json();
  source = "print(2)";
  const confirmed = await handleProjectExecution(
    request("/api/native/build/ws_2/executions/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
    services,
    "ws_2",
    "confirm",
  );
  assert.equal(confirmed.status, 409);
  assert.equal(sandboxCalls, 0);
});

test("Data Lab validates bounded CSV, TSV, and record-oriented JSON imports", async () => {
  const imported = normalizeDataLabImport({
    name: "Sales",
    files: [
      { path: "sales.csv", content: "month,total\nJan,10\nFeb,20\n" },
      {
        path: "regions.json",
        content: JSON.stringify({ records: [{ region: "North", total: 30 }] }),
      },
    ],
  });
  assert.equal(imported.name, "Sales");
  assert.equal(imported.files.length, 2);
  assert.ok(imported.total_bytes > 0);
  assert.throws(
    () =>
      normalizeDataLabImport({
        files: [{ path: "../private.csv", content: "x\n1" }],
      }),
    (error) =>
      error instanceof HttpError && error.code === "invalid_workspace_path",
  );
  assert.throws(
    () =>
      normalizeDataLabImport({
        files: [{ path: "object.json", content: '{"name":"not rows"}' }],
      }),
    (error) =>
      error instanceof HttpError && error.code === "invalid_data_json_shape",
  );
  assert.throws(
    () =>
      normalizeDataLabImport({
        files: [
          {
            path: "nested.json",
            content: JSON.stringify([{ name: "row", nested: { value: 1 } }]),
          },
        ],
      }),
    (error) =>
      error instanceof HttpError && error.code === "invalid_data_json_shape",
  );
  assert.throws(
    () =>
      normalizeDataLabImport({
        files: [{ path: "data.xlsx", content: "not supported yet" }],
      }),
    (error) =>
      error instanceof HttpError && error.code === "unsupported_data_file",
  );
  const first = await createDataLabManifest(imported.files);
  const second = await createDataLabManifest([...imported.files].reverse());
  assert.equal(first.digest, second.digest);
  assert.equal(first.file_count, 2);
});

test("Data Lab exposes only server-defined analysis operations", () => {
  assert.equal(
    normalizeDataLabRequest({ message: "Analiziraj ovaj CSV" }).operation,
    "profile",
  );
  assert.equal(
    normalizeDataLabRequest({ message: "Očisti duplikate" }).operation,
    "clean",
  );
  assert.equal(
    normalizeDataLabRequest({ message: "Napravi grafikon" }).operation,
    "chart",
  );
  assert.throws(
    () => normalizeDataLabRequest({ operation: "python" }),
    (error) =>
      error instanceof HttpError && error.code === "invalid_data_operation",
  );
  assert.throws(
    () => normalizeDataLabRequest({ operation: "chart", x_column: "hidden" }),
    (error) =>
      error instanceof HttpError &&
      error.code === "custom_chart_options_not_supported",
  );
  const capabilities = dataLabCapabilities(true);
  assert.equal(capabilities.configured, true);
  assert.equal(capabilities.arbitrary_code_enabled, false);
  assert.equal(capabilities.arbitrary_shell_enabled, false);
  assert.equal(capabilities.secrets_forwarded, false);
  assert.deepEqual(capabilities.formats, ["csv", "tsv", "json"]);
});

test("Data Lab executes a fixed script only after immutable one-time approval", async () => {
  const calls = [];
  const persisted = [];
  let outputDirectory = "";
  const sources = [
    {
      path: "sales.csv",
      content: "month,total\nJan,10\nFeb,20\n",
      mime: "text/csv",
    },
  ];
  const report = {
    version: 1,
    operation: "chart",
    warnings: [],
    files: [
      {
        path: "sales.csv",
        format: "csv",
        row_count: 2,
        column_count: 2,
        columns: [
          { name: "month", dtype: "object", missing: 0, unique: 2 },
          {
            name: "total",
            dtype: "int64",
            missing: 0,
            unique: 2,
            numeric: { mean: 15, median: 15, min: 10, max: 20 },
          },
        ],
        preview: [
          { month: "Jan", total: 10 },
          { month: "Feb", total: 20 },
        ],
        chart: {
          type: "bar",
          x_column: "month",
          y_column: "total",
          artifact: "chart.png",
        },
      },
    ],
  };
  const env = {
    UNIT369_SANDBOX: {},
    TOOL_STORE: toolStoreNamespace(),
  };
  const services = {
    datasetName: "Sales",
    async readInputFiles() {
      return sources;
    },
    async persistArtifact(artifact) {
      persisted.push(artifact);
      return {
        id: `f_${persisted.length}`,
        path: artifact.path,
        mime: artifact.mime,
        size: artifact.size,
        encoding: artifact.encoding,
      };
    },
  };
  const runtime = {
    getSandbox(_binding, id, options) {
      calls.push({ type: "sandbox", id, options });
      return {
        async mkdir(path) {
          calls.push({ type: "mkdir", path });
          if (path.endsWith("/output")) outputDirectory = path;
        },
        async writeFile(path, content, options) {
          calls.push({ type: "write", path, content, options });
        },
        async exec(command, options) {
          calls.push({ type: "exec", command, options });
          assert.equal(command, DATA_LAB_COMMAND);
          assert.deepEqual(Object.keys(options.env).sort(), [
            "MPLBACKEND",
            "NO_COLOR",
            "PYTHONDONTWRITEBYTECODE",
            "UNIT369_DATA_CONFIG",
            "UNIT369_DATA_INPUT_DIR",
            "UNIT369_DATA_OUTPUT_DIR",
          ]);
          return {
            success: true,
            exitCode: 0,
            stdout: '{"status":"completed"}\n',
            stderr: "",
          };
        },
        async readFile(path, options) {
          if (path === `${outputDirectory}/report.json`) {
            return options.encoding === "utf-8"
              ? {
                  content: JSON.stringify(report),
                  mimeType: "application/json",
                }
              : {
                  content: "eyJ2ZXJzaW9uIjoxfQ==",
                  mimeType: "application/json",
                };
          }
          assert.equal(path, `${outputDirectory}/chart.png`);
          assert.deepEqual(options, { encoding: "base64" });
          return { content: "iVBORw0KGgo=", mimeType: "image/png" };
        },
        async listFiles(path) {
          assert.equal(path, outputDirectory);
          return {
            files: [
              {
                type: "file",
                relativePath: "chart.png",
                absolutePath: `${outputDirectory}/chart.png`,
                size: 8,
              },
              {
                type: "file",
                relativePath: "report.json",
                absolutePath: `${outputDirectory}/report.json`,
                size: 13,
              },
            ],
          };
        },
        async destroy() {
          calls.push({ type: "destroy" });
        },
      };
    },
  };
  const account = { uid: "owner-data-lab" };
  const plannedResponse = await handleDataLabExecution(
    request("/api/native/data-lab/dataset_1/executions/plan", {
      operation: "chart",
    }),
    env,
    account,
    runtime,
    services,
    "dataset_1",
    "plan",
  );
  assert.equal(plannedResponse.status, 202);
  const planned = await plannedResponse.json();
  assert.equal(planned.approval_required, true);
  assert.equal(planned.execution.operation, "chart");
  assert.equal(calls.length, 0);

  const confirmedResponse = await handleDataLabExecution(
    request("/api/native/data-lab/dataset_1/executions/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
    services,
    "dataset_1",
    "confirm",
  );
  assert.equal(
    confirmedResponse.status,
    200,
    await confirmedResponse.clone().text(),
  );
  const confirmed = await confirmedResponse.json();
  assert.equal(confirmed.status, "completed");
  assert.equal(confirmed.report.files[0].row_count, 2);
  assert.equal(confirmed.artifacts[0].mime, "image/png");
  assert.equal(confirmed.artifacts[0].preview_base64, "iVBORw0KGgo=");
  assert.equal(persisted.length, 2);
  assert.equal(calls.filter((entry) => entry.type === "exec").length, 1);
  assert.equal(calls.at(-1).type, "destroy");
  assert.ok(
    calls
      .filter((entry) => entry.type === "write")
      .every(
        (entry) => !String(entry.content).includes("CLOUDFLARE_API_TOKEN"),
      ),
  );

  const replayResponse = await handleDataLabExecution(
    request("/api/native/data-lab/dataset_1/executions/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
    services,
    "dataset_1",
    "confirm",
  );
  assert.equal(replayResponse.status, 409);
  assert.equal(calls.filter((entry) => entry.type === "exec").length, 1);
});

test("Data Lab approval fails closed when dataset contents change", async () => {
  let content = "value\n1\n";
  let sandboxCalls = 0;
  const env = {
    UNIT369_SANDBOX: {},
    TOOL_STORE: toolStoreNamespace(),
  };
  const services = {
    datasetName: "Changing data",
    async readInputFiles() {
      return [{ path: "values.csv", content }];
    },
    async persistArtifact() {
      throw new Error("should not persist");
    },
  };
  const runtime = {
    getSandbox() {
      sandboxCalls += 1;
      throw new Error("should not execute");
    },
  };
  const account = { uid: "owner-changing-data" };
  const plannedResponse = await handleDataLabExecution(
    request("/api/native/data-lab/dataset_2/executions/plan", {
      operation: "profile",
    }),
    env,
    account,
    runtime,
    services,
    "dataset_2",
    "plan",
  );
  const planned = await plannedResponse.json();
  content = "value\n2\n";
  const confirmed = await handleDataLabExecution(
    request("/api/native/data-lab/dataset_2/executions/confirm", {
      approval_id: planned.approval.id,
      approval_token: planned.approval.token,
    }),
    env,
    account,
    runtime,
    services,
    "dataset_2",
    "confirm",
  );
  assert.equal(confirmed.status, 409);
  assert.equal(sandboxCalls, 0);
});

test("Data Lab report normalization bounds previews and statistics", () => {
  const normalized = normalizeDataLabReport({
    version: 1,
    operation: "profile",
    warnings: ["x".repeat(700)],
    files: [
      {
        path: "data.csv",
        row_count: 2,
        column_count: 1,
        columns: [
          {
            name: "value",
            dtype: "float64",
            missing: 0,
            unique: 2,
            numeric: { mean: Infinity, median: 2, min: 1, max: 3 },
          },
        ],
        preview: [{ value: "y".repeat(900) }],
      },
    ],
  });
  assert.equal(normalized.warnings[0].length, 500);
  assert.equal(normalized.files[0].columns[0].numeric.mean, null);
  assert.equal(normalized.files[0].preview[0].value.length, 500);
});
