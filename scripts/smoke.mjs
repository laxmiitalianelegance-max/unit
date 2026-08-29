import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://127.0.0.1:8791";
const secret = "local-smoke-app-secret-369";
const smokeRunId = randomUUID().replaceAll("-", "");
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
    "UNIT369_OWNER_ACCESS_CODE:local-unit369-owner-access-code-2026",
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
  const scopedUid = `${uid}-${smokeRunId}`;
  const body = Buffer.from(
    JSON.stringify({
      uid: scopedUid,
      email: `${scopedUid}@test.local`,
      name: scopedUid,
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
  assert.ok(html.includes('data-page="knowledge"'));
  assert.ok(html.includes('id="u369-knowledge-list"'));
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
  assert.equal(releaseHealth.status, 503);
  const releaseHealthBody = await releaseHealth.json();
  assert.equal(releaseHealthBody.status, "not_ready");
  assert.equal(releaseHealthBody.core_ready, false);
  assert.equal(releaseHealthBody.ai.provider, "unit369-native");
  assert.equal(releaseHealthBody.checks.external_ai_configured, false);
  assert.equal(releaseHealthBody.checks.owned_inference_configured, false);
  assert.equal(releaseHealthBody.checks.owned_inference, true);
  assert.equal(releaseHealthBody.owned_ai_operational, false);
  assert.equal(releaseHealthBody.checks.owner_auth, true);
  assert.equal(releaseHealthBody.checks.google_oauth, false);
  assert.equal(releaseHealthBody.checks.authentication, true);
  assert.equal(releaseHealthBody.checks.sandbox_binding, false);

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

  const ownerLogin = await fetch(`${origin}/api/auth/owner/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({
      access_code: "local-unit369-owner-access-code-2026",
    }),
  });
  assert.equal(ownerLogin.status, 200, await ownerLogin.clone().text());
  const ownerCookie = ownerLogin.headers.get("set-cookie").split(";")[0];
  assert.match(ownerCookie, /^__Host-u369_account=/);

  const ownerStatus = await fetch(`${origin}/api/auth/me`, {
    headers: { cookie: ownerCookie },
  });
  const ownerStatusBody = await ownerStatus.json();
  assert.equal(ownerStatusBody.authenticated, true);
  assert.equal(ownerStatusBody.owner_available, true);
  assert.equal(ownerStatusBody.google_available, false);
  assert.equal(ownerStatusBody.user.provider, "owner");

  const nativeChat = await fetch(`${origin}/api/free-ai`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: ownerCookie,
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

  const dataCapabilities = await fetch(
    `${origin}/api/native/data-lab/capabilities`,
    { headers: { cookie: sessionCookie("smoke-user") } },
  );
  assert.equal(dataCapabilities.status, 200);
  const dataCapabilitiesBody = await dataCapabilities.json();
  assert.equal(dataCapabilitiesBody.configured, false);
  assert.deepEqual(dataCapabilitiesBody.formats, [
    "csv",
    "tsv",
    "json",
    "xlsx",
  ]);
  assert.ok(dataCapabilitiesBody.operations.includes("predict"));
  assert.equal(dataCapabilitiesBody.prediction.model_persisted, false);
  assert.ok(dataCapabilitiesBody.operations.includes("trend"));
  assert.equal(dataCapabilitiesBody.trend.exploratory_only, true);
  assert.equal(dataCapabilitiesBody.trend.max_series, 10);
  assert.equal(dataCapabilitiesBody.approval_required, true);

  const dataImport = await fetch(`${origin}/api/native/data-lab/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: sessionCookie("smoke-user"),
    },
    body: JSON.stringify({
      name: "Smoke dataset",
      files: [
        {
          path: "sales.csv",
          content: "month,total\nJan,10\nFeb,20\n",
          mime: "text/csv",
        },
      ],
    }),
  });
  assert.equal(dataImport.status, 201, await dataImport.clone().text());
  const dataImportBody = await dataImport.json();
  assert.ok(dataImportBody.dataset.id);
  assert.equal(dataImportBody.files.length, 1);

  const unavailableDataPlan = await fetch(
    `${origin}/api/native/data-lab/${encodeURIComponent(dataImportBody.dataset.id)}/executions/plan`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({ operation: "profile" }),
    },
  );
  assert.equal(unavailableDataPlan.status, 503);
  assert.equal(
    (await unavailableDataPlan.json()).code,
    "sandbox_not_configured",
  );

  const knowledgeCapabilities = await fetch(
    `${origin}/api/native/knowledge/capabilities`,
    { headers: { cookie: sessionCookie("smoke-user") } },
  );
  assert.equal(knowledgeCapabilities.status, 200);
  const knowledgeCapabilitiesBody = await knowledgeCapabilities.json();
  assert.equal(knowledgeCapabilitiesBody.owner_scoped, true);
  assert.equal(knowledgeCapabilitiesBody.external_required, false);
  assert.equal(knowledgeCapabilitiesBody.ranking, "fts5-bm25");
  assert.equal(knowledgeCapabilitiesBody.import_approval_required, true);

  const knowledgeImport = await fetch(`${origin}/api/native/knowledge/import`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      cookie: sessionCookie("smoke-user"),
    },
    body: JSON.stringify({
      name: "Smoke knowledge",
      tags: ["project", "smoke"],
      files: [
        {
          path: "orion.md",
          content:
            "# Project Orion\nLaunch window is 14 October. Owner is Mila.\n",
        },
        {
          path: "support.txt",
          content: "Primary support channel is the Unit369 owner chat.\n",
        },
      ],
    }),
  });
  assert.equal(
    knowledgeImport.status,
    202,
    await knowledgeImport.clone().text(),
  );
  const knowledgeImportBody = await knowledgeImport.json();
  assert.equal(knowledgeImportBody.approval_required, true);
  assert.equal(knowledgeImportBody.knowledge_import.file_count, 2);
  assert.ok(knowledgeImportBody.knowledge_import.manifest_hash);

  const confirmKnowledge = () =>
    fetch(
      `${origin}/api/native/knowledge/imports/${encodeURIComponent(knowledgeImportBody.knowledge_import.id)}/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: sessionCookie("smoke-user"),
        },
        body: JSON.stringify({
          approval_id: knowledgeImportBody.approval.id,
          approval_token: knowledgeImportBody.approval.token,
        }),
      },
    );
  const confirmedKnowledge = await confirmKnowledge();
  assert.equal(
    confirmedKnowledge.status,
    200,
    await confirmedKnowledge.clone().text(),
  );
  const confirmedKnowledgeBody = await confirmedKnowledge.json();
  assert.equal(confirmedKnowledgeBody.status, "completed");
  assert.equal(confirmedKnowledgeBody.documents.length, 2);

  const knowledgeSearch = await fetch(
    `${origin}/api/native/knowledge/search?q=${encodeURIComponent("Orion launch")}&limit=5`,
    { headers: { cookie: sessionCookie("smoke-user") } },
  );
  if (!knowledgeSearch.ok) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  assert.equal(
    knowledgeSearch.status,
    200,
    `${await knowledgeSearch.clone().text()}\n${logs}`,
  );
  const knowledgeSearchBody = await knowledgeSearch.json();
  assert.equal(
    knowledgeSearchBody.source,
    "unit369-durable-object-sqlite-fts5",
  );
  assert.equal(knowledgeSearchBody.results[0].title, "Project Orion");
  assert.equal(knowledgeSearchBody.results[0].source_path, "orion.md");
  assert.match(knowledgeSearchBody.results[0].excerpt, /launch|october/i);

  const isolatedKnowledgeSearch = await fetch(
    `${origin}/api/native/knowledge/search?q=${encodeURIComponent("Orion launch")}&limit=5`,
    { headers: { cookie: sessionCookie("other-smoke-user") } },
  );
  assert.equal(isolatedKnowledgeSearch.status, 200);
  assert.deepEqual((await isolatedKnowledgeSearch.json()).results, []);

  const knowledgeDocuments = await fetch(
    `${origin}/api/native/knowledge/documents?limit=100`,
    { headers: { cookie: sessionCookie("smoke-user") } },
  );
  assert.equal(
    knowledgeDocuments.status,
    200,
    await knowledgeDocuments.clone().text(),
  );
  const knowledgeDocumentsBody = await knowledgeDocuments.json(),
    orionDocument = knowledgeDocumentsBody.documents.find(
      (document) => document.source_path === "orion.md",
    ),
    supportDocument = knowledgeDocumentsBody.documents.find(
      (document) => document.source_path === "support.txt",
    );
  assert.equal(knowledgeDocumentsBody.documents.length, 2);
  assert.ok(orionDocument?.id);
  assert.ok(supportDocument?.id);
  assert.ok(orionDocument.size > 0);

  const knowledgeDocumentDetail = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(orionDocument.id)}`,
    { headers: { cookie: sessionCookie("smoke-user") } },
  );
  assert.equal(knowledgeDocumentDetail.status, 200);
  const knowledgeDocumentDetailBody = await knowledgeDocumentDetail.json();
  assert.equal(
    knowledgeDocumentDetailBody.document.meta.source_path,
    "orion.md",
  );
  assert.match(knowledgeDocumentDetailBody.document.content, /14 October/);

  const isolatedKnowledgeDocument = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(orionDocument.id)}`,
    { headers: { cookie: sessionCookie("other-smoke-user") } },
  );
  assert.equal(isolatedKnowledgeDocument.status, 404);

  const bypassDelete = await fetch(
    `${origin}/api/native/documents/${encodeURIComponent(supportDocument.id)}`,
    {
      method: "DELETE",
      headers: { origin, cookie: sessionCookie("smoke-user") },
    },
  );
  assert.equal(bypassDelete.status, 405);
  assert.equal(
    (await bypassDelete.json()).code,
    "knowledge_document_approval_required",
  );

  const updateKnowledgePlan = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(orionDocument.id)}/update`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({
        title: "Project Orion — approved",
        tags: ["project", "smoke", "approved"],
      }),
    },
  );
  assert.equal(updateKnowledgePlan.status, 202);
  const updateKnowledgePlanBody = await updateKnowledgePlan.json();
  const confirmKnowledgeUpdate = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(orionDocument.id)}/update/confirm`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({
        approval_id: updateKnowledgePlanBody.approval.id,
        approval_token: updateKnowledgePlanBody.approval.token,
      }),
    },
  );
  assert.equal(
    confirmKnowledgeUpdate.status,
    200,
    await confirmKnowledgeUpdate.clone().text(),
  );
  const updatedKnowledgeDocument = await confirmKnowledgeUpdate.json();
  assert.equal(
    updatedKnowledgeDocument.document.title,
    "Project Orion — approved",
  );
  assert.equal(updatedKnowledgeDocument.document.version, 2);

  const staleDeletePlan = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(supportDocument.id)}/delete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: "{}",
    },
  );
  assert.equal(staleDeletePlan.status, 202);
  const staleDeletePlanBody = await staleDeletePlan.json();

  const supportUpdatePlan = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(supportDocument.id)}/update`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({
        title: "Support channel",
        tags: ["support", "smoke"],
      }),
    },
  );
  assert.equal(supportUpdatePlan.status, 202);
  const supportUpdatePlanBody = await supportUpdatePlan.json();
  const confirmSupportUpdate = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(supportDocument.id)}/update/confirm`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({
        approval_id: supportUpdatePlanBody.approval.id,
        approval_token: supportUpdatePlanBody.approval.token,
      }),
    },
  );
  assert.equal(confirmSupportUpdate.status, 200);

  const rejectedStaleDelete = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(supportDocument.id)}/delete/confirm`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({
        approval_id: staleDeletePlanBody.approval.id,
        approval_token: staleDeletePlanBody.approval.token,
      }),
    },
  );
  assert.equal(rejectedStaleDelete.status, 409);
  assert.equal(
    (await rejectedStaleDelete.json()).code,
    "approved_knowledge_document_changed",
  );

  const deleteKnowledgePlan = await fetch(
    `${origin}/api/native/knowledge/documents/${encodeURIComponent(supportDocument.id)}/delete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: "{}",
    },
  );
  const deleteKnowledgePlanBody = await deleteKnowledgePlan.json();
  assert.equal(deleteKnowledgePlan.status, 202);
  const confirmKnowledgeDelete = () =>
    fetch(
      `${origin}/api/native/knowledge/documents/${encodeURIComponent(supportDocument.id)}/delete/confirm`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          cookie: sessionCookie("smoke-user"),
        },
        body: JSON.stringify({
          approval_id: deleteKnowledgePlanBody.approval.id,
          approval_token: deleteKnowledgePlanBody.approval.token,
        }),
      },
    );
  const deletedKnowledge = await confirmKnowledgeDelete();
  assert.equal(
    deletedKnowledge.status,
    200,
    await deletedKnowledge.clone().text(),
  );
  assert.equal((await deletedKnowledge.json()).deleted, true);
  const replayedDelete = await confirmKnowledgeDelete();
  assert.equal(replayedDelete.status, 409);

  const deletedKnowledgeSearch = await fetch(
    `${origin}/api/native/knowledge/search?q=${encodeURIComponent("Primary support channel")}&limit=5`,
    { headers: { cookie: sessionCookie("smoke-user") } },
  );
  assert.equal(deletedKnowledgeSearch.status, 200);
  assert.deepEqual((await deletedKnowledgeSearch.json()).results, []);

  const replayedKnowledge = await confirmKnowledge();
  assert.equal(replayedKnowledge.status, 409);

  const mutableKnowledgeImport = await fetch(
    `${origin}/api/native/knowledge/import`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({
        name: "Immutable knowledge",
        files: [
          {
            path: "immutable.md",
            content: "# Immutable source\nApproved content.\n",
          },
        ],
      }),
    },
  );
  assert.equal(mutableKnowledgeImport.status, 202);
  const mutableKnowledgeBody = await mutableKnowledgeImport.json();
  const stagedFiles = await fetch(
    `${origin}/api/native/files?parent_id=${encodeURIComponent(mutableKnowledgeBody.knowledge_import.id)}`,
    { headers: { cookie: sessionCookie("smoke-user") } },
  );
  assert.equal(stagedFiles.status, 200);
  const stagedFile = (await stagedFiles.json()).files[0];
  assert.ok(stagedFile?.id);
  const mutateStagedFile = await fetch(
    `${origin}/api/native/files/${encodeURIComponent(stagedFile.id)}`,
    {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({ content: "# Changed after approval\n" }),
    },
  );
  assert.equal(mutateStagedFile.status, 200);
  const rejectedMutableKnowledge = await fetch(
    `${origin}/api/native/knowledge/imports/${encodeURIComponent(mutableKnowledgeBody.knowledge_import.id)}/confirm`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: sessionCookie("smoke-user"),
      },
      body: JSON.stringify({
        approval_id: mutableKnowledgeBody.approval.id,
        approval_token: mutableKnowledgeBody.approval.token,
      }),
    },
  );
  assert.equal(rejectedMutableKnowledge.status, 409);
  assert.equal(
    (await rejectedMutableKnowledge.json()).code,
    "approved_knowledge_digest_mismatch",
  );

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
  assert.equal(oauth.status, 503);
  assert.equal(oauth.headers.get("location"), null);

  const accountPage = await fetch(`${origin}/account`);
  assert.equal(accountPage.status, 200);
  assert.match(await accountPage.text(), /id="owner-form"/);

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
