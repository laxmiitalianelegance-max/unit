import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMessages } from "../src/ai-providers.js";
import { handleAuth } from "../src/accounts.js";
import { planNativeIntent } from "../src/native-capabilities.js";
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
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
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

test("native planner identifies independent capability domains", () => {
  const plan = planNativeIntent(
    "Napravi dokument, projekat, proizvod i poruku za kupca",
  );
  for (const capability of ["create", "work", "business", "communicate"]) {
    assert.ok(plan.steps.some((step) => step.capability === capability));
  }
  assert.equal(plan.external_required, false);
});
