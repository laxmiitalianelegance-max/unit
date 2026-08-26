import { HttpError, readResponseJsonLimited } from "./runtime-utils.js";
import { toolStore } from "./tool-store.js";

async function internalJson(response) {
  const data = await readResponseJsonLimited(response, 128 * 1024);
  if (!response.ok) {
    throw new HttpError(
      response.status,
      data.error || "Internal state service failed.",
      data.code || "state_service_error",
    );
  }
  return data;
}

export async function enforceQuota(env, ownerId, scope, windows) {
  const response = await toolStore(env, ownerId).fetch(
    `https://store/rate-limit/${encodeURIComponent(scope)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ windows }),
    },
  );
  const data = await readResponseJsonLimited(response, 32 * 1024);
  if (response.status === 429) {
    throw new HttpError(
      429,
      "Request limit reached. Try again later.",
      "rate_limited",
    );
  }
  if (!response.ok || data.allowed !== true) {
    throw new HttpError(
      503,
      "Rate-limit service is unavailable.",
      "rate_limit_unavailable",
    );
  }
  return data;
}

export async function getSharedCache(env, key) {
  const response = await toolStore(env, "__unit369_shared__").fetch(
    `https://store/cache/${encodeURIComponent(key)}`,
  );
  if (response.status === 404) return null;
  const data = await internalJson(response);
  return data.hit ? data.value : null;
}

export async function putSharedCache(env, key, value, ttlMs) {
  const response = await toolStore(env, "__unit369_shared__").fetch(
    `https://store/cache/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value, ttl_ms: ttlMs }),
    },
  );
  await internalJson(response);
}

export async function deleteSharedCache(env, key) {
  const response = await toolStore(env, "__unit369_shared__").fetch(
    `https://store/cache/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
  await internalJson(response);
}

export async function requestApproval(env, ownerId, kind, action) {
  const response = await toolStore(env, ownerId).fetch(
    "https://store/approvals",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, action }),
    },
  );
  return internalJson(response);
}

export async function consumeApproval(env, ownerId, kind, id, token) {
  const response = await toolStore(env, ownerId).fetch(
    `https://store/approvals/${encodeURIComponent(id)}/consume`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, token }),
    },
  );
  return internalJson(response);
}

export async function cancelApproval(env, ownerId, kind, id, token) {
  const response = await toolStore(env, ownerId).fetch(
    `https://store/approvals/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, token }),
    },
  );
  return internalJson(response);
}
