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
  html.includes("unit369-ui-i18n-v6-"),
  "Translation cache version is stale",
);
assert.ok(!html.includes(".jpg"), "The UI still references legacy JPG icons");
assert.ok(
  !html.includes("Math.random"),
  "Conversation IDs must use Web Crypto",
);
assert.ok(
  !/(OPENAI_API_KEY|GROK_API_KEY|ANTHROPIC_API_KEY)/.test(html) &&
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

console.log(
  `Static checks passed: ${sourceJavaScript.length} reachable modules, valid inline scripts, config and PWA assets.`,
);
