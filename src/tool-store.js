import {
  HttpError,
  json,
  readJsonLimited,
  readStreamLimited,
  sha256,
} from "./runtime-utils.js";

const MAX_INTERNAL_BODY = 96 * 1024;
const MAX_APPROVAL_AGE_MS = 10 * 60 * 1000;

function cleanSegment(value, max = 160) {
  const segment = String(value || "").trim();
  return /^[A-Za-z0-9._:-]+$/.test(segment) ? segment.slice(0, max) : "";
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fixedEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1)
    mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

export function toolStore(env, ownerId) {
  if (!env.TOOL_STORE) throw new Error("TOOL_STORE binding is not configured.");
  return env.TOOL_STORE.get(env.TOOL_STORE.idFromName(ownerId));
}

export class ToolStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map(decodeURIComponent);

    try {
      if (parts[0] === "token")
        return this.token(request, cleanSegment(parts[1]));
      if (parts[0] === "rate-limit")
        return this.rateLimit(request, cleanSegment(parts[1]));
      if (parts[0] === "cache")
        return this.cache(request, cleanSegment(parts[1], 240));
      if (parts[0] === "approvals")
        return this.approvals(request, parts.slice(1));
      return json({ error: "Tool store route not found." }, 404);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: error.message || "Tool store error." }, status);
    }
  }

  async alarm() {
    const now = Date.now();
    const entries = await this.state.storage.list({ prefix: "approval:" });
    const remove = [];
    let next = null;
    for (const [key, entry] of entries) {
      if (!entry || typeof entry !== "object") {
        remove.push(key);
        continue;
      }
      const deadline =
        entry.status === "pending"
          ? Number(entry.expires_at || 0)
          : Number(entry.purge_at || 0);
      if (!deadline || deadline <= now) remove.push(key);
      else next = next === null ? deadline : Math.min(next, deadline);
    }
    if (remove.length) await this.state.storage.delete(remove);
    if (next !== null) await this.state.storage.setAlarm(next);
  }

  async token(request, id) {
    if (!id) return json({ error: "Token id is required." }, 400);
    const key = `token:${id}`;
    if (request.method === "GET") {
      const value = await this.state.storage.get(key);
      return value ? new Response(value) : new Response("", { status: 404 });
    }
    if (request.method === "PUT") {
      const bytes = await readStreamLimited(
        request.body,
        MAX_INTERNAL_BODY,
        Number(request.headers.get("content-length") || 0),
      );
      await this.state.storage.put(key, new TextDecoder().decode(bytes));
      return new Response("ok");
    }
    if (request.method === "DELETE") {
      await this.state.storage.delete(key);
      return new Response("ok");
    }
    return json({ error: "Method not allowed." }, 405);
  }

  async rateLimit(request, scope) {
    if (request.method !== "POST")
      return json({ error: "Method not allowed." }, 405);
    if (!scope) return json({ error: "Rate-limit scope is required." }, 400);
    const body = await readJsonLimited(request, 8 * 1024);
    const windows = Array.isArray(body.windows) ? body.windows.slice(0, 4) : [];
    if (!windows.length)
      return json(
        { error: "At least one rate-limit window is required." },
        400,
      );

    const normalized = windows.map((entry) => {
      const windowMs = Math.max(
        1000,
        Math.min(24 * 60 * 60 * 1000, Number(entry.window_ms) || 0),
      );
      const limit = Math.max(1, Math.min(10000, Number(entry.limit) || 0));
      return { windowMs, limit };
    });
    const now = Date.now();

    const result = await this.state.storage.transaction(async (transaction) => {
      const buckets = normalized.map(({ windowMs, limit }) => {
        const bucket = Math.floor(now / windowMs);
        return {
          windowMs,
          limit,
          bucket,
          key: `rate:${scope}:${windowMs}:${bucket}`,
        };
      });
      const current = await transaction.get(buckets.map((entry) => entry.key));
      const blocked = buckets.find(
        (entry) => Number(current.get(entry.key) || 0) >= entry.limit,
      );
      if (blocked) {
        return {
          allowed: false,
          retry_after_ms: blocked.windowMs - (now % blocked.windowMs),
          limit: blocked.limit,
          window_ms: blocked.windowMs,
        };
      }

      const updates = {};
      for (const entry of buckets) {
        updates[entry.key] = Number(current.get(entry.key) || 0) + 1;
        const stale = await transaction.list({
          prefix: `rate:${scope}:${entry.windowMs}:`,
        });
        const staleKeys = [...stale.keys()].filter((key) => key !== entry.key);
        if (staleKeys.length) await transaction.delete(staleKeys);
      }
      await transaction.put(updates);
      return { allowed: true };
    });

    return json(
      result,
      result.allowed ? 200 : 429,
      result.allowed
        ? {}
        : { "retry-after": String(Math.ceil(result.retry_after_ms / 1000)) },
    );
  }

  async cache(request, key) {
    if (!key) return json({ error: "Cache key is required." }, 400);
    const storageKey = `cache:${key}`;
    if (request.method === "GET") {
      const entry = await this.state.storage.get(storageKey);
      if (!entry || typeof entry !== "object") return json({ hit: false }, 404);
      if (Number(entry.expires_at || 0) <= Date.now()) {
        await this.state.storage.delete(storageKey);
        return json({ hit: false }, 404);
      }
      return json({
        hit: true,
        value: entry.value,
        expires_at: entry.expires_at,
      });
    }
    if (request.method === "PUT") {
      const body = await readJsonLimited(request, MAX_INTERNAL_BODY);
      const ttlMs = Math.max(
        1000,
        Math.min(30 * 24 * 60 * 60 * 1000, Number(body.ttl_ms) || 0),
      );
      await this.state.storage.put(storageKey, {
        value: body.value,
        expires_at: Date.now() + ttlMs,
      });
      return json({ ok: true });
    }
    if (request.method === "DELETE") {
      await this.state.storage.delete(storageKey);
      return json({ ok: true });
    }
    return json({ error: "Method not allowed." }, 405);
  }

  async approvals(request, parts) {
    if (!parts.length && request.method === "POST") {
      const body = await readJsonLimited(request, MAX_INTERNAL_BODY);
      const kind = cleanSegment(body.kind, 80);
      if (
        !kind ||
        !body.action ||
        typeof body.action !== "object" ||
        Array.isArray(body.action)
      ) {
        return json({ error: "Approval kind and action are required." }, 400);
      }
      const id = `approval_${crypto.randomUUID().replace(/-/g, "")}`;
      const token = randomToken();
      const tokenHash = await sha256(token);
      const actionJson = JSON.stringify(body.action);
      if (new TextEncoder().encode(actionJson).byteLength > 64 * 1024) {
        return json({ error: "Approval action is too large." }, 413);
      }
      const digest = await sha256(actionJson);
      const expiresAt = Date.now() + MAX_APPROVAL_AGE_MS;
      await this.state.storage.put(`approval:${id}`, {
        id,
        kind,
        action: body.action,
        digest,
        token_hash: tokenHash,
        status: "pending",
        created_at: Date.now(),
        expires_at: expiresAt,
      });
      const existingAlarm = await this.state.storage.getAlarm?.();
      if (!existingAlarm || existingAlarm > expiresAt) {
        await this.state.storage.setAlarm?.(expiresAt);
      }
      return json({ id, token, digest, expires_at: expiresAt }, 201);
    }

    const id = cleanSegment(parts[0], 180);
    if (!id) return json({ error: "Approval id is required." }, 400);
    if (parts[1] !== "consume" || request.method !== "POST") {
      return json({ error: "Approval route not found." }, 404);
    }
    const body = await readJsonLimited(request, 8 * 1024);
    const providedHash = await sha256(String(body.token || ""));
    const key = `approval:${id}`;
    const result = await this.state.storage.transaction(async (transaction) => {
      const entry = await transaction.get(key);
      if (!entry || typeof entry !== "object")
        return { error: "Approval not found.", status: 404 };
      if (entry.status !== "pending")
        return { error: "Approval has already been used.", status: 409 };
      if (Number(entry.expires_at || 0) <= Date.now()) {
        await transaction.delete(key);
        return { error: "Approval expired.", status: 410 };
      }
      if (!fixedEqual(entry.token_hash, providedHash))
        return { error: "Approval token is invalid.", status: 403 };
      if (body.kind && entry.kind !== body.kind)
        return { error: "Approval kind does not match.", status: 409 };
      const consumedAt = Date.now();
      await transaction.put(key, {
        id: entry.id,
        kind: entry.kind,
        digest: entry.digest,
        status: "consumed",
        created_at: entry.created_at,
        consumed_at: consumedAt,
        purge_at: consumedAt + 24 * 60 * 60 * 1000,
      });
      return {
        ok: true,
        kind: entry.kind,
        action: entry.action,
        digest: entry.digest,
      };
    });
    if (result.ok) {
      const purgeAt = Date.now() + 24 * 60 * 60 * 1000;
      const existingAlarm = await this.state.storage.getAlarm?.();
      if (!existingAlarm || existingAlarm > purgeAt) {
        await this.state.storage.setAlarm?.(purgeAt);
      }
    }
    return json(result, result.status || 200);
  }
}
