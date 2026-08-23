import {
  HttpError,
  json,
  readJsonLimited,
  readResponseJsonLimited,
} from "./runtime-utils.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();

function clean(value, max = 4000) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function safeId(value) {
  const id = String(value || "");
  return /^[A-Za-z0-9._:-]{1,180}$/.test(id) ? id : "";
}

function prefix(uid) {
  return `users/${uid}/files/`;
}

function fileKey(uid, id) {
  return `${prefix(uid)}${id}`;
}

function legacyStore(env, uid) {
  if (!env.NATIVE_STORE)
    throw new Error("NATIVE_STORE binding is not configured.");
  return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid));
}

function legacyRequest(env, uid, path, init = {}) {
  return legacyStore(env, uid).fetch(
    new Request(`https://native.internal/native-store/files${path}`, init),
  );
}

function legacyForward(env, uid, path, request) {
  return legacyRequest(env, uid, path, {
    method: request.method,
    headers: request.headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  });
}

function decodeBase64(value) {
  const text = String(value || "").replace(/^data:[^,]*,/, "");
  let raw;
  try {
    raw = atob(text);
  } catch {
    throw new HttpError(
      400,
      "File content is not valid base64.",
      "invalid_base64",
    );
  }
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1)
    bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function encodeBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let raw = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    raw += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(raw);
}

function metadata(body, existing = {}) {
  const rawParentId =
    body.parent_id === undefined ? existing.parent_id || "" : body.parent_id;
  if (rawParentId && !safeId(rawParentId)) {
    throw new HttpError(400, "Invalid parent_id.", "invalid_parent_id");
  }
  const meta =
    body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
      ? body.meta
      : existing.meta || {};
  const metaJson = JSON.stringify(meta);
  if (encoder.encode(metaJson).byteLength > 1800) {
    throw new HttpError(
      413,
      "File metadata is too large.",
      "file_metadata_too_large",
    );
  }
  const now = Date.now();
  return {
    name: clean(body.name || existing.name || "file", 180),
    parent_id: safeId(rawParentId),
    mime: clean(body.mime || existing.mime || "application/octet-stream", 120),
    meta,
    created_at: Number(existing.created_at || now),
    updated_at: now,
  };
}

function customMetadata(value) {
  return {
    name: value.name,
    parent_id: value.parent_id,
    mime: value.mime,
    meta: JSON.stringify(value.meta),
    created_at: String(value.created_at),
    updated_at: String(value.updated_at),
  };
}

function objectFile(object) {
  const meta = object.customMetadata || {};
  let parsed = {};
  try {
    parsed = JSON.parse(meta.meta || "{}");
  } catch {}
  return {
    id: object.key.split("/").pop(),
    name: meta.name || object.key.split("/").pop(),
    parent_id: meta.parent_id || "",
    mime:
      meta.mime ||
      object.httpMetadata?.contentType ||
      "application/octet-stream",
    meta: parsed,
    size: object.size,
    created_at: Number(
      meta.created_at || object.uploaded?.getTime?.() || Date.now(),
    ),
    updated_at: Number(
      meta.updated_at || object.uploaded?.getTime?.() || Date.now(),
    ),
    storage: "r2",
  };
}

async function listLegacy(env, uid, url) {
  const response = await legacyRequest(env, uid, `${url.search}`);
  if (!response.ok) return [];
  const data = await readResponseJsonLimited(response, 512 * 1024).catch(
    () => ({}),
  );
  return Array.isArray(data.files)
    ? data.files.map((file) => ({ ...file, storage: "legacy" }))
    : [];
}

async function listFiles(request, env, account, url) {
  if (!env.FILES) return legacyRequest(env, account.uid, url.search);
  const limit = Math.max(
    1,
    Math.min(200, Number(url.searchParams.get("limit")) || 100),
  );
  const cursor = clean(url.searchParams.get("cursor"), 1000) || undefined;
  const query = clean(url.searchParams.get("q"), 120).toLowerCase();
  const rawParentId = url.searchParams.get("parent_id") || "";
  const parentId = safeId(rawParentId);
  if (rawParentId && !parentId) {
    throw new HttpError(400, "Invalid parent_id.", "invalid_parent_id");
  }
  const listed = await env.FILES.list({
    prefix: prefix(account.uid),
    limit,
    ...(cursor ? { cursor } : {}),
    include: ["customMetadata", "httpMetadata"],
  });
  let files = listed.objects.map(objectFile);
  files = files.filter((file) => file.parent_id === parentId);
  if (query)
    files = files.filter((file) => file.name.toLowerCase().includes(query));
  if (!cursor) {
    const legacy = await listLegacy(env, account.uid, url);
    const ids = new Set(files.map((file) => file.id));
    files.push(...legacy.filter((file) => !ids.has(file.id)));
  }
  files.sort((left, right) => right.updated_at - left.updated_at);
  return json({
    files: files.slice(0, limit),
    pagination: {
      limit,
      cursor: listed.truncated ? listed.cursor : null,
      has_more: listed.truncated,
    },
  });
}

async function getFile(env, account, id) {
  if (env.FILES) {
    const object = await env.FILES.get(fileKey(account.uid, id));
    if (object) {
      if (object.size > MAX_FILE_BYTES) {
        throw new HttpError(
          413,
          "Stored file exceeds the 5 MiB retrieval limit.",
          "file_too_large",
        );
      }
      const file = objectFile(object);
      const buffer = await object.arrayBuffer();
      file.body =
        file.meta.encoding === "base64"
          ? encodeBase64(buffer)
          : new TextDecoder().decode(buffer);
      return json({ file });
    }
  }
  return legacyRequest(env, account.uid, `/${encodeURIComponent(id)}`);
}

async function createFile(request, env, account) {
  if (!env.FILES) return legacyForward(env, account.uid, "", request);
  const body = await readJsonLimited(request, MAX_JSON_BYTES);
  const value = metadata(body);
  if (!value.name)
    throw new HttpError(400, "File name is required.", "file_name_required");
  const bytes =
    value.meta.encoding === "base64"
      ? decodeBase64(body.content)
      : encoder.encode(String(body.content ?? ""));
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new HttpError(
      413,
      "File content exceeds the 5 MiB limit.",
      "file_too_large",
    );
  }
  const id = `f_${crypto.randomUUID().replace(/-/g, "")}`;
  await env.FILES.put(fileKey(account.uid, id), bytes, {
    httpMetadata: { contentType: value.mime },
    customMetadata: customMetadata(value),
  });
  return json(
    { file: { id, ...value, size: bytes.byteLength, storage: "r2" } },
    201,
  );
}

async function updateFile(request, env, account, id) {
  if (!env.FILES)
    return legacyForward(
      env,
      account.uid,
      `/${encodeURIComponent(id)}`,
      request,
    );
  const currentObject = await env.FILES.get(fileKey(account.uid, id));
  if (!currentObject)
    return legacyForward(
      env,
      account.uid,
      `/${encodeURIComponent(id)}`,
      request,
    );
  if (currentObject.size > MAX_FILE_BYTES) {
    throw new HttpError(
      413,
      "Stored file exceeds the 5 MiB update limit.",
      "file_too_large",
    );
  }
  const current = objectFile(currentObject);
  const body = await readJsonLimited(request, MAX_JSON_BYTES);
  const value = metadata(body, current);
  const bytes =
    body.content === undefined
      ? new Uint8Array(await currentObject.arrayBuffer())
      : value.meta.encoding === "base64"
        ? decodeBase64(body.content)
        : encoder.encode(String(body.content));
  if (bytes.byteLength > MAX_FILE_BYTES)
    throw new HttpError(
      413,
      "File content exceeds the 5 MiB limit.",
      "file_too_large",
    );
  await env.FILES.put(fileKey(account.uid, id), bytes, {
    httpMetadata: { contentType: value.mime },
    customMetadata: customMetadata(value),
  });
  return json({ ok: true, id, updated_at: value.updated_at, storage: "r2" });
}

async function deleteFile(env, account, id) {
  if (env.FILES) {
    const existing = await env.FILES.head(fileKey(account.uid, id));
    if (existing) {
      await env.FILES.delete(fileKey(account.uid, id));
      return json({ ok: true, storage: "r2" });
    }
  }
  return legacyRequest(env, account.uid, `/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function handleNativeFiles(request, env, account) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/native\/files\/?/, "");
  const segments = path.split("/").filter(Boolean);
  const id = segments.length === 1 ? safeId(segments[0]) : "";
  if (!path && request.method === "GET")
    return listFiles(request, env, account, url);
  if (!path && request.method === "POST")
    return createFile(request, env, account);
  if (!id) return json({ error: "Invalid file id." }, 400);
  if (request.method === "GET") return getFile(env, account, id);
  if (request.method === "PUT") return updateFile(request, env, account, id);
  if (request.method === "DELETE") return deleteFile(env, account, id);
  return json({ error: "Method not allowed." }, 405);
}
