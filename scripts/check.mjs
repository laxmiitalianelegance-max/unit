import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "src");

function filesBelow(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

function imports(path) {
  const source = readFileSync(path, "utf8");
  const pattern =
    /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => resolve(dirname(path), specifier));
}

const entry = join(sourceRoot, "unit369.js");
const reachable = new Set();
const pending = [entry];
while (pending.length) {
  const path = pending.pop();
  if (reachable.has(path)) continue;
  assert.ok(existsSync(path), `Missing imported file: ${path}`);
  reachable.add(path);
  if (extname(path) === ".js") pending.push(...imports(path));
}

const sourceJavaScript = filesBelow(sourceRoot).filter(
  (path) => extname(path) === ".js",
);
assert.deepEqual(
  sourceJavaScript.filter((path) => !reachable.has(path)),
  [],
  "Every server module must be reachable from src/unit369.js",
);

for (const path of sourceJavaScript) {
  execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
  const source = readFileSync(path, "utf8");
  assert.ok(
    !/request\.json\s*\(/.test(source),
    `${path} bypasses bounded JSON input`,
  );
  assert.ok(
    !/\ballowWrite\b/.test(source),
    `${path} contains an approval bypass`,
  );
}

const html = readFileSync(join(sourceRoot, "app.html"), "utf8");
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) new Function(match[1]);
}
assert.ok(html.includes('data-mode="auto"'), "Auto fallback mode is missing");
assert.ok(
  html.includes("unit369-ui-i18n-v16-"),
  "Translation cache version is stale",
);
assert.ok(
  html.includes("recoverInterruptedTurns") &&
    html.includes("controller.abort()") &&
    html.includes("190_000") &&
    html.includes('pendingState = "modelStarting"'),
  "Chat recovery and request timeout safeguards are missing",
);
assert.ok(
  html.includes("isExplicitCodeCommand") &&
    html.includes("/api/native/code/${path}") &&
    html.includes("data-code-approve") &&
    html.includes("data-code-cancel") &&
    html.includes("const codeApprovals = new Map()"),
  "Explicit code approval UI or in-memory approval storage is missing",
);
assert.ok(
  html.includes('id="u369-project-files"') &&
    html.includes("/api/native/build/${path}") &&
    html.includes("data-project-approve") &&
    html.includes("data-project-cancel") &&
    html.includes("data-project-download"),
  "Multi-file project approval or artifact UI is missing",
);
assert.ok(
  html.includes("/api/native/data-lab/${path}") &&
    html.includes("isDataAttachmentSet") &&
    html.includes("data-data-approve") &&
    html.includes("data-data-cancel") &&
    html.includes("data-data-download") &&
    html.includes("compactDataTool") &&
    html.includes("renderDataTrend") &&
    html.includes("projectAttachmentNames") &&
    html.includes("attachmentFileTypes") &&
    html.includes("inferPredictionTarget") &&
    html.includes(
      'accept=".py,.js,.mjs,.cjs,.json,.md,.markdown,.txt,.html,.css,.yaml,.yml,.toml,.csv,.tsv,.xlsx"',
    ),
  "Data Lab import, approval, result or artifact UI is missing",
);
assert.ok(
  html.includes("/api/native/knowledge/${path}") &&
    html.includes("isKnowledgeImportRequest") &&
    html.includes("isKnowledgeSearchRequest") &&
    html.includes("data-knowledge-approve") &&
    html.includes("data-knowledge-cancel") &&
    html.includes("compactKnowledgeTool"),
  "Native knowledge import, approval or cited-search UI is missing",
);
assert.ok(
  html.includes('data-page="knowledge"') &&
    html.includes('id="u369-knowledge-list"') &&
    html.includes("planKnowledgeMetadataUpdate") &&
    html.includes("planKnowledgeDocumentDelete") &&
    html.includes("confirmKnowledgeManagerMutation") &&
    html.includes("const knowledgeManagerState = {"),
  "Knowledge Manager or its in-memory approval flow is missing",
);
const knowledgeSource = readFileSync(
  join(sourceRoot, "native-knowledge.js"),
  "utf8",
);
const nativeStoreSource = readFileSync(
  join(sourceRoot, "native-store.js"),
  "utf8",
);
assert.ok(
  knowledgeSource.includes("import_approval_required: true") &&
    knowledgeSource.includes("external_required: false") &&
    nativeStoreSource.includes(
      "CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts",
    ) &&
    nativeStoreSource.includes("transactionSync"),
  "Owner-scoped approved FTS5 knowledge storage is missing",
);
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
assert.ok(
  dockerfile.includes("openpyxl==3.1.5") &&
    dockerfile.includes("defusedxml==0.7.1"),
  "The XLSX parser dependencies are not pinned safely",
);
assert.ok(!html.includes(".jpg"), "The UI still references legacy JPG icons");
assert.ok(
  !html.includes("Math.random"),
  "Conversation IDs must use Web Crypto",
);
assert.ok(
  !/(OPENAI_API_KEY|GROK_API_KEY|ANTHROPIC_API_KEY|UNIT369_INFERENCE_TOKEN)/.test(
    html,
  ) &&
    !/fetch\s*\(\s*["'`]https:\/\/(?:api\.openai\.com|api\.anthropic\.com|api\.x\.ai)/.test(
      html,
    ),
  "Provider endpoints or secrets leaked into the browser bundle",
);

const config = readFileSync(join(root, "wrangler.jsonc"), "utf8");
for (const required of [
  '"main": "src/unit369.js"',
  '"binding": "AI"',
  '"binding": "ASSETS"',
  '"binding": "SELF"',
  '"name": "TOOL_STORE"',
  '"name": "NATIVE_STORE"',
  '"name": "UNIT369_SANDBOX"',
  '"class_name": "Sandbox"',
  '"image": "./Dockerfile"',
  '"observability"',
]) {
  assert.ok(config.includes(required), `wrangler.jsonc is missing ${required}`);
}
assert.ok(
  !config.includes('"r2_buckets"'),
  "Production must not require an R2 subscription",
);
assert.ok(
  !existsSync(join(root, "wrangler.toml")),
  "Legacy wrangler.toml still exists",
);
assert.ok(
  existsSync(join(root, "package-lock.json")),
  "package-lock.json is missing",
);
assert.ok(
  existsSync(join(root, "Dockerfile")),
  "Sandbox Dockerfile is missing",
);
const packageJson = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
assert.equal(
  packageJson.dependencies?.["@cloudflare/sandbox"],
  "0.12.8",
  "Sandbox SDK and container image must stay version-pinned",
);
assert.ok(
  readFileSync(join(root, "Dockerfile"), "utf8").includes(
    "cloudflare/sandbox:0.12.8-python",
  ),
  "Sandbox Docker image must match the SDK version",
);

function assertPng(path, width, height) {
  const bytes = readFileSync(path);
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${path} is not a PNG`,
  );
  assert.equal(bytes.readUInt32BE(16), width, `${path} width is invalid`);
  assert.equal(bytes.readUInt32BE(20), height, `${path} height is invalid`);
}

assertPng(join(root, "public/unit369-192.png"), 192, 192);
assertPng(join(root, "public/unit369-512.png"), 512, 512);

const workflows = readdirSync(join(root, ".github/workflows")).filter((name) =>
  name.endsWith(".yml"),
);
assert.deepEqual(
  workflows.sort(),
  ["deploy-production.yml", "validate.yml"],
  "Only the canonical validation and deployment workflows should remain",
);
const ownedInferenceSource = readFileSync(
  join(sourceRoot, "owned-inference.js"),
  "utf8",
);
const coreSource = readFileSync(join(sourceRoot, "unit369-core.js"), "utf8");
const aiProvidersSource = readFileSync(
  join(sourceRoot, "ai-providers.js"),
  "utf8",
);
const deployWorkflow = readFileSync(
  join(root, ".github/workflows/deploy-production.yml"),
  "utf8",
);
assert.ok(
  ownedInferenceSource.includes(
    "export const UNIT369_OWNED_TIMEOUT_MS = 180_000",
  ) &&
    ownedInferenceSource.includes("probeOwnedIntelligence") &&
    ownedInferenceSource.includes('/models"') &&
    ownedInferenceSource.includes('"model_not_found"') &&
    ownedInferenceSource.includes('"owned_inference_retry"') &&
    coreSource.includes(
      "ownedAi.operational ? 30 * 24 * 60 * 60 * 1000 : 4_000",
    ),
  "Owned inference cold-start, model discovery, retry or release probe is missing",
);
assert.ok(
  coreSource.includes("checks.owned_inference =") &&
    coreSource.includes("owned_ai_operational") &&
    coreSource.includes("ownedInference: false") &&
    coreSource.includes("commercialFallback: false") &&
    aiProvidersSource.includes("options.ownedInference !== false") &&
    !deployWorkflow.includes("probe_owned=1") &&
    !deployWorkflow.includes("h.owned_ai_operational===true"),
  "RunPod is not optional on the default chat and production release paths",
);

console.log(
  `Static checks passed: ${sourceJavaScript.length} reachable modules, valid inline scripts, config and PWA assets.`,
);
