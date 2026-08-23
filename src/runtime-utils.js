const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class HttpError extends Error {
  constructor(status, message, code = "request_error") {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function safeError(error) {
  return String(error?.message || error || "Unknown error").slice(0, 700);
}

export function logEvent(level, event, fields = {}) {
  const payload = {
    event,
    at: new Date().toISOString(),
    ...fields,
  };
  const method =
    level === "error" ? "error" : level === "warn" ? "warn" : "log";
  console[method](payload);
}

export async function readStreamLimited(stream, maxBytes, declared = 0) {
  if (declared > maxBytes) {
    throw new HttpError(413, "Request body is too large.", "payload_too_large");
  }
  if (!stream) return new Uint8Array();

  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("payload too large");
        throw new HttpError(
          413,
          "Request body is too large.",
          "payload_too_large",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBodyLimited(request, maxBytes) {
  const declared = Number(request.headers.get("content-length") || 0);
  return readStreamLimited(request.body, maxBytes, declared);
}

export async function readJsonLimited(request, maxBytes = 64 * 1024) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new HttpError(
      415,
      "Content-Type must be application/json.",
      "unsupported_media_type",
    );
  }
  const bytes = await readBodyLimited(request, maxBytes);
  if (!bytes.byteLength) return {};
  try {
    const value = JSON.parse(decoder.decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("JSON object required");
    }
    return value;
  } catch {
    throw new HttpError(
      400,
      "Request body must be valid JSON.",
      "invalid_json",
    );
  }
}

export async function readResponseJsonLimited(response, maxBytes = 512 * 1024) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    throw new HttpError(
      502,
      "Upstream response exceeded the safety limit.",
      "upstream_too_large",
    );
  }
  let bytes;
  try {
    bytes = await readStreamLimited(response.body, maxBytes, declared);
  } catch (error) {
    if (error instanceof HttpError && error.status === 413) {
      throw new HttpError(
        502,
        "Upstream response exceeded the safety limit.",
        "upstream_too_large",
      );
    }
    throw error;
  }
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new HttpError(
      502,
      "Upstream returned invalid JSON.",
      "invalid_upstream_json",
    );
  }
}

export function requireSameOrigin(request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (!origin || origin !== expected) {
    throw new HttpError(403, "Cross-site request blocked.", "origin_mismatch");
  }
}

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/=+$/g, "");
}

function setCommonHeaders(headers) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("x-frame-options", "DENY");
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
}

export async function secureResponse(response) {
  const headers = new Headers(response.headers);
  setCommonHeaders(headers);
  const type = headers.get("content-type") || "";
  if (!type.includes("text/html")) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const cspNonce = nonce();
  const declared = Number(response.headers.get("content-length") || 0);
  const bytes = await readStreamLimited(
    response.body,
    2 * 1024 * 1024,
    declared,
  );
  const html = decoder
    .decode(bytes)
    .replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${cspNonce}"`)
    .replace(/<style(?![^>]*\bnonce=)/gi, `<style nonce="${cspNonce}"`);
  headers.delete("content-length");
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${cspNonce}'`,
      `style-src 'self' 'nonce-${cspNonce}'`,
      "img-src 'self' data: https://*.googleusercontent.com",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function errorResponse(error, context = {}) {
  const status = error instanceof HttpError ? error.status : 500;
  const code = error instanceof HttpError ? error.code : "internal_error";
  logEvent(status >= 500 ? "error" : "warn", "request_failed", {
    ...context,
    status,
    code,
    error: safeError(error),
  });
  return json(
    {
      error: status >= 500 ? "Internal service error." : error.message,
      code,
    },
    status,
  );
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(String(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
