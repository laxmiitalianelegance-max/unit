import {
  cancelApproval,
  consumeApproval,
  enforceQuota,
  requestApproval,
} from "./state-services.js";
import {
  HttpError,
  errorResponse,
  json,
  logEvent,
  readJsonLimited,
  readResponseJsonLimited,
  sha256,
} from "./runtime-utils.js";
import { normalizeWorkspacePath } from "./native-project-execution.js";

const APPROVAL_KIND = "native-knowledge-import";
const DOCUMENT_UPDATE_APPROVAL_KIND = "native-knowledge-document-update";
const DOCUMENT_DELETE_APPROVAL_KIND = "native-knowledge-document-delete";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024;
const MAX_IMPORT_BODY_BYTES = 768 * 1024;
const STAGING_TTL_MS = 20 * 60 * 1000;
const ALLOWED_EXTENSIONS = new Set([".txt", ".md", ".markdown"]);
const IMPORT_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 20 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 100 },
]);
const SEARCH_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 240 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 2_000 },
]);
const MANAGER_READ_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 600 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 5_000 },
]);
const MANAGER_MUTATION_WINDOWS = Object.freeze([
  { window_ms: 60 * 60 * 1000, limit: 60 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 300 },
]);

function clean(value, max = 240) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function validId(value) {
  return /^[A-Za-z0-9._:-]{1,180}$/.test(String(value || ""));
}

function extension(path) {
  const value = String(path || "").toLowerCase();
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index);
}

function byteLength(value) {
  return new TextEncoder().encode(String(value ?? "")).byteLength;
}

function normalizedContent(value) {
  const content = String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  if (content.includes("\u0000")) {
    throw new HttpError(
      415,
      "Knowledge documents must contain UTF-8 text.",
      "binary_knowledge_document",
    );
  }
  const safe = content.replace(
    /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
    "",
  );
  if (!safe.trim()) {
    throw new HttpError(
      400,
      "Knowledge documents cannot be empty.",
      "empty_knowledge_document",
    );
  }
  return safe;
}

function titleFrom(path, content, supplied) {
  const explicit = clean(supplied, 160);
  if (explicit) return explicit;
  const heading = String(content).match(/^\s{0,3}#{1,2}\s+([^\r\n]{1,160})/m);
  if (heading) return clean(heading[1].replace(/\s+#+\s*$/, ""), 160);
  const name = String(path).split("/").pop() || "Document";
  return clean(name.replace(/\.(?:txt|md|markdown)$/i, ""), 160) || "Document";
}

function normalizeTags(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => clean(item, 60))
    .filter(Boolean)
    .slice(0, 16);
}

export function normalizeKnowledgeImport(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(
      400,
      "Knowledge import must be an object.",
      "invalid_knowledge_import",
    );
  }
  if (!Array.isArray(input.files) || !input.files.length) {
    throw new HttpError(
      400,
      "At least one TXT or Markdown file is required.",
      "knowledge_files_required",
    );
  }
  if (input.files.length > MAX_FILES) {
    throw new HttpError(
      413,
      `Knowledge import accepts at most ${MAX_FILES} files.`,
      "too_many_knowledge_files",
    );
  }
  const seen = new Set();
  let totalBytes = 0;
  const files = input.files.map((source) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new HttpError(
        400,
        "Every knowledge file must be an object.",
        "invalid_knowledge_file",
      );
    }
    const path = normalizeWorkspacePath(source.path || source.name);
    const ext = extension(path);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new HttpError(
        415,
        `Unsupported knowledge file type: ${path}`,
        "unsupported_knowledge_file",
      );
    }
    const folded = path.toLowerCase();
    if (seen.has(folded)) {
      throw new HttpError(
        409,
        `Duplicate knowledge path: ${path}`,
        "duplicate_knowledge_path",
      );
    }
    seen.add(folded);
    if (typeof source.content !== "string") {
      throw new HttpError(
        415,
        `Knowledge file must contain UTF-8 text: ${path}`,
        "invalid_knowledge_content",
      );
    }
    const content = normalizedContent(source.content);
    const size = byteLength(content);
    if (size > MAX_FILE_BYTES) {
      throw new HttpError(
        413,
        `${path} exceeds the 128 KiB knowledge limit.`,
        "knowledge_file_too_large",
      );
    }
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new HttpError(
        413,
        "Knowledge import exceeds the 512 KiB total limit.",
        "knowledge_import_too_large",
      );
    }
    const format = ext === ".txt" ? "text" : "markdown";
    return {
      path,
      title: titleFrom(path, content, source.title),
      content,
      format,
      mime: format === "markdown" ? "text/markdown" : "text/plain",
      size,
    };
  });
  return {
    name:
      clean(input.name, 160) ||
      (files.length === 1 ? files[0].title : "Unit369 knowledge import"),
    tags: normalizeTags(input.tags),
    files,
    total_bytes: totalBytes,
  };
}

export async function createKnowledgeManifest(files) {
  const entries = [];
  for (const file of files) {
    entries.push({
      path: file.path,
      title: file.title,
      format: file.format,
      size: file.size,
      sha256: await sha256(file.content),
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return {
    entries,
    file_count: entries.length,
    total_bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    digest: await sha256(JSON.stringify(entries)),
  };
}

export function knowledgeCapabilities() {
  return {
    engine: "unit369-durable-object-sqlite-fts5",
    owner_scoped: true,
    external_required: false,
    import_approval_required: true,
    search_approval_required: false,
    manager: {
      list: true,
      source_preview: true,
      metadata_update_approval_required: true,
      delete_approval_required: true,
      content_replace_supported: false,
    },
    formats: ["txt", "md", "markdown"],
    ranking: "fts5-bm25",
    limits: {
      max_files: MAX_FILES,
      max_file_bytes: MAX_FILE_BYTES,
      max_total_bytes: MAX_TOTAL_BYTES,
      max_search_results: 10,
    },
  };
}

function documentSummary(document) {
  return {
    id: clean(document?.id, 180),
    title: clean(document?.title, 160),
    format: clean(document?.format, 40),
    tags: normalizeTags(document?.tags),
    source_path: clean(
      document?.source_path || document?.meta?.source_path,
      240,
    ),
    size: Math.max(
      0,
      Number(document?.size) || byteLength(document?.content || ""),
    ),
    version: Math.max(1, Math.trunc(Number(document?.version) || 1)),
    created_at: Math.max(0, Number(document?.created_at) || 0),
    updated_at: Math.max(0, Number(document?.updated_at) || 0),
  };
}

export async function createKnowledgeDocumentSnapshot(document) {
  const summary = documentSummary(document);
  if (!validId(summary.id) || !summary.title || !summary.updated_at) {
    throw new HttpError(
      409,
      "Knowledge document metadata is incomplete.",
      "invalid_knowledge_document_snapshot",
    );
  }
  const snapshot = {
    document_id: summary.id,
    title: summary.title,
    format: summary.format,
    tags: summary.tags,
    source_path: summary.source_path,
    version: summary.version,
    updated_at: summary.updated_at,
    content_sha256: await sha256(String(document?.content ?? "")),
  };
  return {
    ...snapshot,
    fingerprint: await sha256(JSON.stringify(snapshot)),
  };
}

function normalizeDocumentMetadataUpdate(input, document) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(
      400,
      "Document update must be an object.",
      "invalid_knowledge_document_update",
    );
  }
  const unsupported = Object.keys(input).filter(
    (key) => !["title", "tags"].includes(key),
  );
  if (unsupported.length) {
    throw new HttpError(
      400,
      "This manager currently updates only document title and tags.",
      "unsupported_knowledge_document_update",
    );
  }
  const title =
      input.title === undefined
        ? clean(document.title, 160)
        : clean(input.title, 160),
    tags =
      input.tags === undefined
        ? normalizeTags(document.tags)
        : normalizeTags(input.tags);
  if (!title) {
    throw new HttpError(
      400,
      "Document title is required.",
      "knowledge_document_title_required",
    );
  }
  if (
    title === clean(document.title, 160) &&
    JSON.stringify(tags) === JSON.stringify(normalizeTags(document.tags))
  ) {
    throw new HttpError(
      400,
      "Document metadata has not changed.",
      "knowledge_document_unchanged",
    );
  }
  return { title, tags };
}

function nativeStore(env, uid) {
  if (!env.NATIVE_STORE) {
    throw new HttpError(
      503,
      "Native knowledge storage is not configured.",
      "native_store_not_configured",
    );
  }
  return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid));
}

async function callStore(env, uid, path, init = {}) {
  const response = await nativeStore(env, uid).fetch(
    new Request(`https://native.internal/native-store${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    }),
  );
  const data = await readResponseJsonLimited(response, 2 * 1024 * 1024);
  if (!response.ok) {
    throw new HttpError(
      response.status,
      data.error || "Native knowledge storage failed.",
      data.code || "native_store_error",
    );
  }
  return data;
}

async function readKnowledgeDocument(env, uid, documentId) {
  const value = await callStore(
    env,
    uid,
    `/documents/${encodeURIComponent(documentId)}`,
  );
  if (!value.document) {
    throw new HttpError(
      404,
      "Knowledge document was not found.",
      "knowledge_document_not_found",
    );
  }
  return value.document;
}

async function listKnowledgeDocuments(env, account, url) {
  await enforceQuota(
    env,
    account.uid,
    "native-knowledge-manager-read",
    MANAGER_READ_WINDOWS,
  );
  const query = clean(url.searchParams.get("q"), 120),
    limit = Math.max(
      1,
      Math.min(100, Math.trunc(Number(url.searchParams.get("limit")) || 50)),
    ),
    offset = Math.max(
      0,
      Math.min(
        1_000_000,
        Math.trunc(Number(url.searchParams.get("offset")) || 0),
      ),
    ),
    search = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      ...(query ? { q: query } : {}),
    });
  return json(
    await callStore(env, account.uid, `/documents?${search.toString()}`),
  );
}

async function getKnowledgeDocument(env, account, documentId) {
  await enforceQuota(
    env,
    account.uid,
    "native-knowledge-manager-read",
    MANAGER_READ_WINDOWS,
  );
  return json({
    document: await readKnowledgeDocument(env, account.uid, documentId),
  });
}

async function planDocumentUpdate(env, account, documentId, request) {
  await enforceQuota(
    env,
    account.uid,
    "native-knowledge-manager-mutation",
    MANAGER_MUTATION_WINDOWS,
  );
  const document = await readKnowledgeDocument(env, account.uid, documentId),
    update = normalizeDocumentMetadataUpdate(
      await readJsonLimited(request, 32 * 1024),
      document,
    ),
    before = await createKnowledgeDocumentSnapshot(document),
    approval = await requestApproval(
      env,
      account.uid,
      DOCUMENT_UPDATE_APPROVAL_KIND,
      { document_id: documentId, before, update },
    );
  return json(
    {
      approval_required: true,
      message: "Review and approve this document metadata change.",
      document: documentSummary(document),
      update,
      approval,
    },
    202,
  );
}

async function confirmDocumentUpdate(env, account, documentId, request) {
  const body = await readJsonLimited(request, 8 * 1024),
    consumed = await consumeApproval(
      env,
      account.uid,
      DOCUMENT_UPDATE_APPROVAL_KIND,
      String(body.approval_id || ""),
      String(body.approval_token || ""),
    );
  if (consumed.action?.document_id !== documentId) {
    throw new HttpError(
      409,
      "Approved document update does not match this request.",
      "approved_knowledge_document_mismatch",
    );
  }
  const document = await readKnowledgeDocument(env, account.uid, documentId),
    current = await createKnowledgeDocumentSnapshot(document);
  if (current.fingerprint !== consumed.action.before?.fingerprint) {
    throw new HttpError(
      409,
      "Knowledge document changed after approval was created.",
      "approved_knowledge_document_changed",
    );
  }
  const query = new URLSearchParams({
      expected_version: String(current.version),
      expected_updated_at: String(current.updated_at),
    }),
    updated = await callStore(
      env,
      account.uid,
      `/documents/${encodeURIComponent(documentId)}?${query.toString()}`,
      {
        method: "PUT",
        body: JSON.stringify(consumed.action.update || {}),
      },
    );
  return json({ status: "completed", document: updated.document });
}

async function planDocumentDelete(env, account, documentId) {
  await enforceQuota(
    env,
    account.uid,
    "native-knowledge-manager-mutation",
    MANAGER_MUTATION_WINDOWS,
  );
  const document = await readKnowledgeDocument(env, account.uid, documentId),
    snapshot = await createKnowledgeDocumentSnapshot(document),
    approval = await requestApproval(
      env,
      account.uid,
      DOCUMENT_DELETE_APPROVAL_KIND,
      { document_id: documentId, snapshot },
    );
  return json(
    {
      approval_required: true,
      message: "Review and approve permanent deletion of this document.",
      document: documentSummary(document),
      fingerprint: snapshot.fingerprint,
      approval,
    },
    202,
  );
}

async function confirmDocumentDelete(env, account, documentId, request) {
  const body = await readJsonLimited(request, 8 * 1024),
    consumed = await consumeApproval(
      env,
      account.uid,
      DOCUMENT_DELETE_APPROVAL_KIND,
      String(body.approval_id || ""),
      String(body.approval_token || ""),
    );
  if (consumed.action?.document_id !== documentId) {
    throw new HttpError(
      409,
      "Approved document deletion does not match this request.",
      "approved_knowledge_document_mismatch",
    );
  }
  const document = await readKnowledgeDocument(env, account.uid, documentId),
    current = await createKnowledgeDocumentSnapshot(document);
  if (current.fingerprint !== consumed.action.snapshot?.fingerprint) {
    throw new HttpError(
      409,
      "Knowledge document changed after approval was created.",
      "approved_knowledge_document_changed",
    );
  }
  const query = new URLSearchParams({
    expected_version: String(current.version),
    expected_updated_at: String(current.updated_at),
  });
  await callStore(
    env,
    account.uid,
    `/documents/${encodeURIComponent(documentId)}?${query.toString()}`,
    { method: "DELETE" },
  );
  return json({
    status: "completed",
    deleted: true,
    document: documentSummary(document),
  });
}

async function cancelDocumentMutation(env, account, request, approvalKind) {
  const body = await readJsonLimited(request, 8 * 1024),
    cancelled = await cancelApproval(
      env,
      account.uid,
      approvalKind,
      String(body.approval_id || ""),
      String(body.approval_token || ""),
    );
  return json({ cancelled: cancelled.cancelled === true });
}

async function handleKnowledgeDocuments(request, env, account, url, parts) {
  if (parts.length === 1 && request.method === "GET") {
    return listKnowledgeDocuments(env, account, url);
  }
  const documentId = parts[1];
  if (!validId(documentId)) {
    throw new HttpError(
      400,
      "Knowledge document id is invalid.",
      "invalid_knowledge_document_id",
    );
  }
  if (parts.length === 2 && request.method === "GET") {
    return getKnowledgeDocument(env, account, documentId);
  }
  if (parts.length > 4)
    return json({ error: "Knowledge document route not found." }, 404);
  const action = parts[2],
    operation = parts.length === 3 ? "plan" : parts[3];
  if (action === "update" && request.method === "POST") {
    if (operation === "plan")
      return planDocumentUpdate(env, account, documentId, request);
    if (operation === "confirm")
      return confirmDocumentUpdate(env, account, documentId, request);
    if (operation === "cancel")
      return cancelDocumentMutation(
        env,
        account,
        request,
        DOCUMENT_UPDATE_APPROVAL_KIND,
      );
  }
  if (action === "delete" && request.method === "POST") {
    if (operation === "plan")
      return planDocumentDelete(env, account, documentId);
    if (operation === "confirm")
      return confirmDocumentDelete(env, account, documentId, request);
    if (operation === "cancel")
      return cancelDocumentMutation(
        env,
        account,
        request,
        DOCUMENT_DELETE_APPROVAL_KIND,
      );
  }
  return json({ error: "Knowledge document route not found." }, 404);
}

async function ensureCollection(env, uid) {
  const value = await callStore(env, uid, "/knowledge/staging");
  return value.collection;
}

async function getImportRecord(env, uid, collectionId, importId) {
  try {
    const value = await callStore(
      env,
      uid,
      `/data/collections/${collectionId}/records/${importId}`,
    );
    return value.record?.data?.type === "knowledge-import"
      ? value.record
      : null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

async function importFiles(env, uid, importId) {
  const value = await callStore(
    env,
    uid,
    `/files?parent_id=${encodeURIComponent(importId)}&limit=20`,
  );
  return value.files || [];
}

async function readStagedFiles(env, uid, importId) {
  const output = [];
  for (const item of await importFiles(env, uid, importId)) {
    const value = await callStore(env, uid, `/files/${item.id}`);
    const file = value.file;
    if (
      file?.parent_id !== importId ||
      file?.meta?.kind !== "knowledge-staging"
    )
      continue;
    output.push({
      path: file.name,
      title: file.meta?.title,
      content: file.body || "",
      format: file.meta?.format,
    });
  }
  return normalizeKnowledgeImport({ files: output }).files;
}

async function deleteImportContents(env, uid, collectionId, importId) {
  for (const file of await importFiles(env, uid, importId)) {
    await callStore(env, uid, `/files/${file.id}`, { method: "DELETE" });
  }
  await callStore(
    env,
    uid,
    `/data/collections/${collectionId}/records/${importId}`,
    { method: "DELETE" },
  );
}

async function stageKnowledgeImport(env, account, request) {
  await enforceQuota(
    env,
    account.uid,
    "native-knowledge-import",
    IMPORT_WINDOWS,
  );
  const normalized = normalizeKnowledgeImport(
    await readJsonLimited(request, MAX_IMPORT_BODY_BYTES),
  );
  const manifest = await createKnowledgeManifest(normalized.files);
  const collection = await ensureCollection(env, account.uid);
  const created = await callStore(
    env,
    account.uid,
    `/data/collections/${collection.id}/records`,
    {
      method: "POST",
      body: JSON.stringify({
        name: normalized.name,
        record: {
          type: "knowledge-import",
          name: normalized.name,
          status: "staged",
          manifest_hash: manifest.digest,
          tags: normalized.tags,
          expires_at: Date.now() + STAGING_TTL_MS,
        },
      }),
    },
  );
  const importId = created.record.id;
  try {
    for (const file of normalized.files) {
      await callStore(env, account.uid, "/files", {
        method: "POST",
        body: JSON.stringify({
          name: file.path,
          parent_id: importId,
          content: file.content,
          mime: file.mime,
          meta: {
            kind: "knowledge-staging",
            title: file.title,
            format: file.format,
          },
        }),
      });
    }
    const approval = await requestApproval(env, account.uid, APPROVAL_KIND, {
      import_id: importId,
      manifest_hash: manifest.digest,
      file_count: manifest.file_count,
      total_bytes: manifest.total_bytes,
      files: manifest.entries,
      tags: normalized.tags,
    });
    return json(
      {
        approval_required: true,
        message:
          "Review and explicitly approve these documents before indexing.",
        knowledge_import: {
          id: importId,
          name: normalized.name,
          manifest_hash: manifest.digest,
          file_count: manifest.file_count,
          total_bytes: manifest.total_bytes,
          files: manifest.entries,
          tags: normalized.tags,
        },
        approval,
      },
      202,
    );
  } catch (error) {
    try {
      await deleteImportContents(env, account.uid, collection.id, importId);
    } catch (cleanupError) {
      logEvent("warn", "knowledge_staging_cleanup_failed", {
        import_id: importId,
        error: String(cleanupError?.message || cleanupError).slice(0, 700),
      });
    }
    throw error;
  }
}

async function confirmKnowledgeImport(env, account, importId, request) {
  const body = await readJsonLimited(request, 8 * 1024);
  const consumed = await consumeApproval(
    env,
    account.uid,
    APPROVAL_KIND,
    String(body.approval_id || ""),
    String(body.approval_token || ""),
  );
  if (consumed.action?.import_id !== importId) {
    throw new HttpError(
      409,
      "Approved knowledge import does not match this request.",
      "approved_knowledge_import_mismatch",
    );
  }
  const collection = await ensureCollection(env, account.uid);
  const record = await getImportRecord(
    env,
    account.uid,
    collection.id,
    importId,
  );
  if (!record) {
    throw new HttpError(
      404,
      "Knowledge import was not found.",
      "knowledge_import_not_found",
    );
  }
  const files = await readStagedFiles(env, account.uid, importId);
  const manifest = await createKnowledgeManifest(files);
  if (manifest.digest !== consumed.action.manifest_hash) {
    throw new HttpError(
      409,
      "Knowledge files changed after approval was created.",
      "approved_knowledge_digest_mismatch",
    );
  }
  const imported = await callStore(env, account.uid, "/knowledge/import", {
    method: "POST",
    body: JSON.stringify({
      files,
      tags: normalizeTags(consumed.action.tags),
      source_import_id: importId,
    }),
  });
  let cleanupPending = false;
  try {
    await deleteImportContents(env, account.uid, collection.id, importId);
  } catch (error) {
    cleanupPending = true;
    logEvent("warn", "knowledge_import_cleanup_failed", {
      import_id: importId,
      error: String(error?.message || error).slice(0, 700),
    });
  }
  return json({
    status: "completed",
    engine: "unit369-durable-object-sqlite-fts5",
    import_id: importId,
    manifest_hash: manifest.digest,
    documents: imported.documents || [],
    cleanup_pending: cleanupPending,
  });
}

async function cancelKnowledgeImport(env, account, importId, request) {
  const body = await readJsonLimited(request, 8 * 1024);
  const cancelled = await cancelApproval(
    env,
    account.uid,
    APPROVAL_KIND,
    String(body.approval_id || ""),
    String(body.approval_token || ""),
  );
  const collection = await ensureCollection(env, account.uid);
  try {
    await deleteImportContents(env, account.uid, collection.id, importId);
  } catch (error) {
    logEvent("warn", "knowledge_cancel_cleanup_failed", {
      import_id: importId,
      error: String(error?.message || error).slice(0, 700),
    });
  }
  return json({ cancelled: cancelled.cancelled === true });
}

async function searchKnowledge(env, account, url) {
  await enforceQuota(
    env,
    account.uid,
    "native-knowledge-search",
    SEARCH_WINDOWS,
  );
  const query = clean(url.searchParams.get("q"), 240);
  if (!query) {
    throw new HttpError(
      400,
      "Knowledge search query is required.",
      "knowledge_query_required",
    );
  }
  const limit = Math.max(
    1,
    Math.min(10, Math.trunc(Number(url.searchParams.get("limit")) || 5)),
  );
  return json(
    await callStore(
      env,
      account.uid,
      `/knowledge/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
  );
}

export async function handleNativeKnowledge(request, env, account) {
  const url = new URL(request.url);
  const parts = url.pathname
    .replace(/^\/api\/native\/knowledge\/?/, "")
    .split("/")
    .filter(Boolean);
  try {
    if (!parts.length && request.method === "GET") {
      return json(knowledgeCapabilities());
    }
    if (parts[0] === "capabilities" && request.method === "GET") {
      return json(knowledgeCapabilities());
    }
    if (parts[0] === "search" && request.method === "GET") {
      return await searchKnowledge(env, account, url);
    }
    if (parts[0] === "documents") {
      return await handleKnowledgeDocuments(request, env, account, url, parts);
    }
    if (parts[0] === "import" && request.method === "POST") {
      return await stageKnowledgeImport(env, account, request);
    }
    if (parts[0] !== "imports" || !validId(parts[1])) {
      return json({ error: "Knowledge route not found." }, 404);
    }
    const importId = parts[1];
    if (parts[2] === "confirm" && request.method === "POST") {
      return await confirmKnowledgeImport(env, account, importId, request);
    }
    if (parts[2] === "cancel" && request.method === "POST") {
      return await cancelKnowledgeImport(env, account, importId, request);
    }
    return json({ error: "Knowledge route not found." }, 404);
  } catch (error) {
    return errorResponse(error, { path: url.pathname, method: request.method });
  }
}
