import {
  HttpError,
  errorResponse,
  readJsonLimited,
  readResponseJsonLimited,
} from "./runtime-utils.js";
import { enforceQuota } from "./state-services.js";

const enc = new TextEncoder(),
  dec = new TextDecoder();
const ACCOUNT_COOKIE = "__Host-u369_account";
const LEGACY_ACCOUNT_COOKIE = "u369_account";
const OAUTH_FLOW_COOKIE = "__Host-u369_oauth_flow";
const OWNER_LOGIN_WINDOWS = Object.freeze([
  { window_ms: 15 * 60 * 1000, limit: 8 },
  { window_ms: 24 * 60 * 60 * 1000, limit: 30 },
]);
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
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(aa, bb);
  }
  let n = 0;
  for (let i = 0; i < aa.length; i++) n |= aa[i] ^ bb[i];
  return n === 0;
}

export function googleOAuthConfigured(env) {
  const clientId = String(env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(env.GOOGLE_CLIENT_SECRET || "").trim();
  return (
    /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId) &&
    clientSecret.length >= 16
  );
}

export function ownerAuthConfigured(env) {
  return String(env.UNIT369_OWNER_ACCESS_CODE || "").length >= 16;
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
      provider: p.provider === "owner" ? "owner" : "google",
    };
  } catch {
    return null;
  }
}
async function startGoogle(url, env) {
  if (!googleOAuthConfigured(env))
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

async function ownerLoginKey(request) {
  const address = String(request.headers.get("cf-connecting-ip") || "unknown");
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", enc.encode(`owner-login:${address}`)),
  );
  return `login_${b64url(digest).slice(0, 32)}`;
}

async function ownerLogin(request, env) {
  if (!ownerAuthConfigured(env)) {
    return json({ error: "Unit369 owner sign-in is not configured." }, 503);
  }
  await enforceQuota(
    env,
    await ownerLoginKey(request),
    "owner-login",
    OWNER_LOGIN_WINDOWS,
  );
  const body = await readJsonLimited(request, 4 * 1024);
  const provided = typeof body.access_code === "string" ? body.access_code : "";
  if (
    provided.length > 512 ||
    !(await safeEqual(provided, env.UNIT369_OWNER_ACCESS_CODE))
  ) {
    return json({ error: "Access code is not valid." }, 401);
  }
  const account = {
      uid: "unit369_owner",
      email: "",
      name: "Unit369 Owner",
      picture: "",
      provider: "owner",
      iat: Date.now(),
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
    token = await signed(env, account),
    headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
  headers.append("set-cookie", accountCookie(token));
  headers.append("set-cookie", secureCookie(LEGACY_ACCOUNT_COOKIE, "", 0));
  return new Response(
    JSON.stringify({
      authenticated: true,
      user: {
        uid: account.uid,
        email: account.email,
        name: account.name,
        picture: account.picture,
        provider: account.provider,
      },
    }),
    { headers },
  );
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
function accountPage(env) {
  const ownerAvailable = ownerAuthConfigured(env);
  const googleAvailable = googleOAuthConfigured(env);
  const ownerPanel = ownerAvailable
    ? `<form id="owner-form"><label for="access-code">Privatni Unit369 kod</label><input id="access-code" name="access_code" type="password" autocomplete="current-password" minlength="16" maxlength="512" required><button class="btn owner" type="submit">Prijavi se u Unit369</button><div id="message" role="status" aria-live="polite"></div></form>`
    : `<div class="notice">Unit369 privatna prijava još nije aktivirana.</div>`;
  const googlePanel = googleAvailable
    ? `<div class="or"><span>ili</span></div><a class="btn google" href="/api/auth/google/start?return_to=/">Continue with Google</a>`
    : "";
  return new Response(
    `<!doctype html><html lang="sr-Latn"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#05070c"><title>Unit369 nalog</title><style>html,body{margin:0;min-height:100%;background:#05070c;color:#f5f8fc;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{min-height:100dvh;display:grid;place-items:center;background:radial-gradient(700px 420px at 50% 0,rgba(40,167,255,.16),transparent 60%),#05070c}.box{width:min(92vw,420px);text-align:center}.logo{width:72px;height:72px;border-radius:20px;object-fit:cover;box-shadow:0 12px 35px rgba(40,167,255,.22)}h1{font-size:27px;margin:18px 0 8px}.sub{color:#95a3b8;font-size:14px;line-height:1.5;margin-bottom:22px}form{display:grid;gap:12px;text-align:left}label{font-size:13px;font-weight:800;color:#c7d5e5}input{width:100%;box-sizing:border-box;border:1px solid #27415c;border-radius:14px;background:#08111b;color:#f5f8fc;padding:14px 15px;font-size:16px;outline:none}input:focus{border-color:#35c5ff;box-shadow:0 0 0 3px rgba(53,197,255,.14)}.btn{width:100%;box-sizing:border-box;border:0;display:flex;align-items:center;justify-content:center;text-decoration:none;border-radius:14px;padding:13px 18px;font-weight:800;font-size:15px;cursor:pointer}.btn.owner{background:linear-gradient(135deg,#35c5ff,#167cef);color:#fff}.btn.google{background:#f5f8fc;color:#111923}.btn:disabled{opacity:.65;cursor:wait}.notice{padding:14px;border:1px solid #3a4654;border-radius:14px;color:#b8c5d5;background:#0b121b}.or{display:flex;align-items:center;gap:10px;color:#63758b;font-size:12px;margin:16px 0}.or:before,.or:after{content:"";height:1px;flex:1;background:#1b2d40}#message{min-height:18px;color:#ff9aaa;text-align:center;font-size:12px}.back{display:block;margin-top:16px;color:#69c8ff;text-decoration:none;font-size:13px}</style></head><body><main class="box"><img class="logo" src="/app-icon-192.png" alt="Unit369"><h1>Unit369</h1><div class="sub">Privatna prijava u tvoj Unit369 nalog. Kod ostaje samo u Cloudflare Secret-u.</div>${ownerPanel}${googlePanel}<a class="back" href="/">Nazad u Unit369</a></main><script>(()=>{const form=document.getElementById('owner-form');if(!form)return;const message=document.getElementById('message'),button=form.querySelector('button');form.addEventListener('submit',async event=>{event.preventDefault();message.textContent='';button.disabled=true;try{const response=await fetch('/api/auth/owner/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({access_code:form.access_code.value})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Prijava nije uspela.');location.replace('/')}catch(error){message.textContent=error.message||'Prijava nije uspela.';form.access_code.select()}finally{button.disabled=false}})})();</script></body></html>`,
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
      return accountPage(env);
    if (url.pathname === "/api/auth/me" && request.method === "GET") {
      const a = await resolveAccount(request, env);
      return json({
        authenticated: !!a,
        user: a || null,
        owner_available: ownerAuthConfigured(env),
        google_available: googleOAuthConfigured(env),
      });
    }
    if (url.pathname === "/api/auth/owner/login" && request.method === "POST")
      return ownerLogin(request, env);
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
