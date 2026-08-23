import {
  HttpError,
  errorResponse,
  readResponseJsonLimited,
} from "./runtime-utils.js";

const enc = new TextEncoder(),
  dec = new TextDecoder();
const ACCOUNT_COOKIE = "__Host-u369_account";
const LEGACY_ACCOUNT_COOKIE = "u369_account";
const OAUTH_FLOW_COOKIE = "__Host-u369_oauth_flow";
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s) {
  s = String(s || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function hmac(env, text) {
  if (!env.APP_SECRET) throw new Error("APP_SECRET is not configured.");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text))),
  );
}
async function safeEqual(a, b) {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    crypto.subtle.digest("SHA-256", enc.encode(String(b))),
  ]);
  const aa = new Uint8Array(left),
    bb = new Uint8Array(right);
  let n = 0;
  for (let i = 0; i < aa.length; i++) n |= aa[i] ^ bb[i];
  return n === 0;
}
function cookieValue(request, name) {
  const c = request.headers.get("cookie") || "";
  for (const part of c.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim()).slice(0, 16_384);
      } catch {
        return "";
      }
    }
  }
  return "";
}
function secureCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Priority=High; Max-Age=${maxAge}`;
}
function accountCookie(value, maxAge = 60 * 60 * 24 * 30) {
  return secureCookie(ACCOUNT_COOKIE, value, maxAge);
}
function oauthFlowCookie(value, maxAge = 10 * 60) {
  return secureCookie(OAUTH_FLOW_COOKIE, value, maxAge);
}
function sanitizeReturnTo(raw, origin) {
  try {
    const u = new URL(raw || "/", origin);
    const destination =
      u.origin === origin
        ? `${origin}${u.pathname}${u.search}${u.hash}`
        : origin + "/";
    return destination.length <= 2_048 ? destination : origin + "/";
  } catch {
    return origin + "/";
  }
}
async function signed(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload))),
    sig = await hmac(env, body);
  return `${body}.${sig}`;
}
async function verifySigned(env, value) {
  const raw = String(value || "");
  if (raw.length > 16_384) return null;
  const i = raw.lastIndexOf(".");
  if (i < 1) return null;
  const body = raw.slice(0, i),
    sig = raw.slice(i + 1);
  if (!(await safeEqual(sig, await hmac(env, body)))) return null;
  try {
    return JSON.parse(dec.decode(fromB64url(body)));
  } catch {
    return null;
  }
}
async function userId(sub) {
  const d = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode("google:" + sub)),
  );
  return "g_" + b64url(d).slice(0, 32);
}
export async function resolveAccount(request, env) {
  try {
    const token =
      cookieValue(request, ACCOUNT_COOKIE) ||
      cookieValue(request, LEGACY_ACCOUNT_COOKIE);
    if (!token) return null;
    const p = await verifySigned(env, token);
    if (!p?.uid || !p?.exp || Date.now() > p.exp) return null;
    return {
      uid: String(p.uid),
      email: String(p.email || "").slice(0, 320),
      name: String(p.name || "").slice(0, 200),
      picture: String(p.picture || "").slice(0, 2_048),
      provider: "google",
    };
  } catch {
    return null;
  }
}
async function startGoogle(url, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    return json({ error: "Google Sign-In is not configured." }, 503);
  const callback = `${url.origin}/api/auth/google/callback`,
    returnTo = sanitizeReturnTo(
      url.searchParams.get("return_to") || "/",
      url.origin,
    ),
    state = await signed(env, {
      returnTo,
      exp: Date.now() + 10 * 60 * 1000,
      nonce: b64url(crypto.getRandomValues(new Uint8Array(16))),
    }),
    verifier = b64url(crypto.getRandomValues(new Uint8Array(32))),
    challenge = b64url(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", enc.encode(verifier)),
      ),
    ),
    flow = await signed(env, {
      state,
      verifier,
      exp: Date.now() + 10 * 60 * 1000,
    }),
    a = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  a.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  a.searchParams.set("redirect_uri", callback);
  a.searchParams.set("response_type", "code");
  a.searchParams.set("scope", "openid email profile");
  a.searchParams.set("state", state);
  a.searchParams.set("code_challenge", challenge);
  a.searchParams.set("code_challenge_method", "S256");
  a.searchParams.set("prompt", "select_account");
  const headers = new Headers({
    location: a.toString(),
    "cache-control": "no-store",
  });
  headers.append("set-cookie", oauthFlowCookie(flow));
  return new Response(null, { status: 302, headers });
}
async function googleCallback(request, url, env) {
  const rawState = url.searchParams.get("state") || "",
    state = await verifySigned(env, rawState),
    flow = await verifySigned(env, cookieValue(request, OAUTH_FLOW_COOKIE));
  if (
    !state?.exp ||
    Date.now() > state.exp ||
    !flow?.exp ||
    Date.now() > flow.exp ||
    !flow.verifier ||
    !(await safeEqual(flow.state, rawState))
  )
    return json({ error: "Invalid or expired Google Sign-In state." }, 400);
  const code = String(url.searchParams.get("code") || "").slice(0, 4_096);
  if (!code)
    return json(
      {
        error:
          url.searchParams.get("error") || "Google Sign-In was not completed.",
      },
      400,
    );
  const callback = `${url.origin}/api/auth/google/callback`,
    controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 20_000),
    r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: controller.signal,
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: callback,
        grant_type: "authorization_code",
        code_verifier: String(flow.verifier),
      }),
    });
  clearTimeout(timeout);
  const tok = await readResponseJsonLimited(r, 256 * 1024);
  if (!r.ok || !tok.access_token)
    return json(
      {
        error:
          tok.error_description || tok.error || "Google token exchange failed.",
      },
      400,
    );
  const profileController = new AbortController(),
    profileTimeout = setTimeout(() => profileController.abort(), 20_000),
    ur = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
      signal: profileController.signal,
    });
  clearTimeout(profileTimeout);
  const u = await readResponseJsonLimited(ur, 256 * 1024);
  if (!ur.ok || !u.sub)
    return json({ error: "Google user profile could not be verified." }, 400);
  if (u.email_verified === false)
    return json({ error: "Google email is not verified." }, 403);
  const account = {
      uid: await userId(String(u.sub)),
      email: String(u.email || "").slice(0, 320),
      name: String(u.name || u.email || "Unit369 user").slice(0, 200),
      picture: String(u.picture || "").slice(0, 2_048),
      iat: Date.now(),
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
    token = await signed(env, account),
    dest = sanitizeReturnTo(state.returnTo, url.origin),
    h = new Headers({ location: dest, "cache-control": "no-store" });
  h.append("set-cookie", accountCookie(token));
  h.append("set-cookie", oauthFlowCookie("", 0));
  h.append("set-cookie", secureCookie(LEGACY_ACCOUNT_COOKIE, "", 0));
  return new Response(null, { status: 302, headers: h });
}
function accountPage() {
  return new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#05070c"><title>Unit369 Account</title><style>html,body{margin:0;min-height:100%;background:#05070c;color:#f5f8fc;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{min-height:100dvh;display:grid;place-items:center;background:radial-gradient(700px 420px at 50% 0,rgba(40,167,255,.16),transparent 60%),#05070c}.box{width:min(92vw,420px);text-align:center}.logo{width:72px;height:72px;border-radius:20px;object-fit:cover;box-shadow:0 12px 35px rgba(40,167,255,.22)}h1{font-size:27px;margin:18px 0 8px}.sub{color:#95a3b8;font-size:14px;line-height:1.5;margin-bottom:22px}.btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border-radius:14px;padding:13px 18px;font-weight:800;background:#f5f8fc;color:#111923}.back{display:block;margin-top:16px;color:#69c8ff;text-decoration:none;font-size:13px}</style></head><body><div class="box"><img class="logo" src="/app-icon-192.png" alt="Unit369"><h1>Unit369</h1><div class="sub">Sign in to keep your integrations private and connected to your own account.</div><a class="btn" href="/api/auth/google/start?return_to=/">Continue with Google</a><a class="back" href="/">Back to Unit369</a></div></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}
export async function handleAuth(request, env) {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/account" && request.method === "GET")
      return accountPage();
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const a = await resolveAccount(request, env);
      return json({
        authenticated: !!a,
        user: a || null,
        google_available: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      });
    }
    if (url.pathname === "/api/auth/google/start" && request.method === "GET")
      return startGoogle(url, env);
    if (
      url.pathname === "/api/auth/google/callback" &&
      request.method === "GET"
    )
      return googleCallback(request, url, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      const h = new Headers({
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      h.append("set-cookie", accountCookie("", 0));
      h.append("set-cookie", secureCookie(LEGACY_ACCOUNT_COOKIE, "", 0));
      h.append("set-cookie", oauthFlowCookie("", 0));
      return new Response(JSON.stringify({ ok: true }), { headers: h });
    }
    return null;
  } catch (e) {
    if (e?.name === "AbortError") {
      return errorResponse(
        new HttpError(
          504,
          "Google authentication timed out.",
          "google_timeout",
        ),
        { path: url.pathname, method: request.method },
      );
    }
    return errorResponse(e, { path: url.pathname, method: request.method });
  }
}
