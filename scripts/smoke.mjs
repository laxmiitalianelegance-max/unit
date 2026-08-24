import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://127.0.0.1:8791";
const secret = "local-smoke-app-secret-369";
const wrangler = resolve(root, "node_modules/.bin/wrangler");
const child = spawn(
  wrangler,
  [
    "dev",
    "--config",
    "tests/wrangler.test.jsonc",
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "8791",
    "--inspector-ip",
    "127.0.0.1",
    "--inspector-port",
    "8792",
    "--no-show-interactive-dev-session",
    "--var",
    `APP_SECRET:${secret}`,
    "--var",
    "ENCRYPTION_KEY:local-smoke-encryption-key-369",
    "--var",
    "GOOGLE_CLIENT_ID:local-google-client",
    "--var",
    "GOOGLE_CLIENT_SECRET:local-google-secret",
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);

let logs = "";
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    logs = (logs + chunk.toString()).slice(-20_000);
  });
}

function sessionCookie(uid) {
  const body = Buffer.from(
    JSON.stringify({
      uid,
      email: `${uid}@test.local`,
      name: uid,
      exp: Date.now() + 60 * 60 * 1000,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(body)
    .digest("base64url");
  return `u369_account=${body}.${signature}`;
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`Wrangler exited early.\n${logs}`);
    try {
      const response = await fetch(origin);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Wrangler did not become ready.\n${logs}`);
}

try {
  const rootResponse = await waitUntilReady();
  const html = await rootResponse.text();
  assert.ok(html.includes('data-mode="auto"'));
  assert.ok(html.includes('id="u369-account-client"'));
  assert.match(rootResponse.headers.get("content-security-policy"), /nonce-/);
  assert.equal(rootResponse.headers.get("x-frame-options"), "DENY");

  const status = await fetch(`${origin}/api/status`);
  assert.equal(status.status, 200);
  const statusBody = await status.json();
  assert.equal(statusBody.core.authentication_required, true);
  assert.equal(statusBody.core.ai_configured, true);
  assert.equal(statusBody.integrations.unit369Native, true);
  assert.equal(statusBody.integrations.workersAi, false);

  const releaseHealth = await fetch(`${origin}/api/health/release`);
  assert.equal(releaseHealth.status, 200);
  const releaseHealthBody = await releaseHealth.json();
  assert.equal(releaseHealthBody.status, "ready");
  assert.equal(releaseHealthBody.core_ready, true);
  assert.equal(releaseHealthBody.ai.provider, "unit369-native");
  assert.equal(releaseHealthBody.checks.external_ai_configured, false);

  const crossSite = await fetch(`${origin}/api/free-ai`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
  });
  assert.equal(crossSite.status, 403);

  const unauthenticated = await fetch(`${origin}/api/free-ai`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
  });
  assert.equal(unauthenticated.status, 401);

  const nativeChat = await fetch(`${origin}/api/free-ai`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: sessionCookie("native-chat-user"),
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Napravi projekat i dokument" }],
    }),
  });
  assert.equal(nativeChat.status, 200, await nativeChat.clone().text());
  const nativeChatBody = await nativeChat.json();
  assert.equal(nativeChatBody.provider, "unit369-native");
  assert.equal(nativeChatBody.external_required, false);
  assert.ok(nativeChatBody.plan.steps.length >= 2);

  const plan = await fetch(`${origin}/api/native/plan`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: sessionCookie("smoke-user"),
    },
    body: JSON.stringify({ message: "Napravi projekat i dokument" }),
  });
  assert.equal(plan.status, 200);
  assert.ok((await plan.json()).steps.length >= 2);

  const productForm = new FormData();
  productForm.append("title", "Smoke product");
  productForm.append("price", "19.90");
  productForm.append("sizes", "M,L");
  productForm.append("status", "DRAFT");
  productForm.append(
    "images",
    new File([new Uint8Array([137, 80, 78, 71])], "smoke.png", {
      type: "image/png",
    }),
  );
  const product = await fetch(`${origin}/api/create-product`, {
    method: "POST",
    headers: { origin, cookie: sessionCookie("smoke-user") },
    body: productForm,
  });
  assert.equal(product.status, 201, await product.text());
  const products = await fetch(`${origin}/api/products`, {
    headers: { cookie: sessionCookie("smoke-user") },
  });
  assert.equal(products.status, 200);
  assert.ok(
    (await products.json()).products.some(
      (entry) => entry.media?.[0]?.storage === "native",
    ),
  );

  const oauth = await fetch(
    `${origin}/api/auth/google/start?return_to=/settings`,
    { redirect: "manual" },
  );
  assert.equal(oauth.status, 302);
  assert.match(oauth.headers.get("set-cookie"), /__Host-u369_oauth_flow=/);
  const oauthLocation = new URL(oauth.headers.get("location"));
  assert.equal(oauthLocation.searchParams.get("code_challenge_method"), "S256");

  const manifest = await fetch(`${origin}/manifest.json`);
  assert.equal(manifest.status, 200);
  assert.deepEqual(
    (await manifest.json()).icons.map((icon) => icon.type),
    ["image/png", "image/png"],
  );

  const icon = await fetch(`${origin}/app-icon-512.png`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("content-type"), /image\/png/);
  assert.ok((await icon.arrayBuffer()).byteLength > 100_000);

  console.log("Local Wrangler smoke test passed.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 3_000)),
  ]);
}
