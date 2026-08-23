import { resolveAccount } from "./accounts.js";
import { consumeApproval, requestApproval } from "./state-services.js";
import {
  HttpError,
  readJsonLimited,
  readResponseJsonLimited,
  readStreamLimited,
} from "./runtime-utils.js";

const enc = new TextEncoder(),
  dec = new TextDecoder();
const TOOLS = {
  anthropic: {
    name: "Anthropic (Claude API)",
    description: "Optional external Anthropic API connection.",
    auth_type: "bearer",
    base_url: "https://api.anthropic.com/v1",
    extra_headers: { "anthropic-version": "2023-06-01" },
  },
  openai: {
    name: "OpenAI",
    description: "Optional external OpenAI API connection.",
    auth_type: "bearer",
    base_url: "https://api.openai.com/v1",
    extra_headers: {},
  },
  xai: {
    name: "xAI (Grok)",
    description: "Optional external xAI API connection.",
    auth_type: "bearer",
    base_url: "https://api.x.ai/v1",
    extra_headers: {},
  },
  github: {
    name: "GitHub",
    description: "Repositories, issues, pull requests and Actions.",
    auth_type: "bearer",
    base_url: "https://api.github.com",
    extra_headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    oauth: {
      authorize_url: "https://github.com/login/oauth/authorize",
      token_url: "https://github.com/login/oauth/access_token",
      client_id_env: "GITHUB_CLIENT_ID",
      client_secret_env: "GITHUB_CLIENT_SECRET",
      scope: "repo workflow read:user",
      format: "json",
    },
  },
  gitlab: {
    name: "GitLab",
    description: "Repositories, merge requests and CI/CD.",
    auth_type: "bearer",
    base_url: "https://gitlab.com/api/v4",
    extra_headers: {},
    oauth: {
      authorize_url: "https://gitlab.com/oauth/authorize",
      token_url: "https://gitlab.com/oauth/token",
      client_id_env: "GITLAB_CLIENT_ID",
      client_secret_env: "GITLAB_CLIENT_SECRET",
      scope: "api read_repository write_repository",
      format: "form",
    },
  },
  netlify: {
    name: "Netlify",
    description: "Sites and deploys.",
    auth_type: "bearer",
    base_url: "https://api.netlify.com/api/v1",
    extra_headers: {},
    oauth: {
      authorize_url: "https://app.netlify.com/authorize",
      token_url: "https://api.netlify.com/oauth/token",
      client_id_env: "NETLIFY_CLIENT_ID",
      client_secret_env: "NETLIFY_CLIENT_SECRET",
      scope: "",
      format: "form",
    },
  },
  vercel: {
    name: "Vercel",
    description: "Projects and deployments.",
    auth_type: "bearer",
    base_url: "https://api.vercel.com",
    extra_headers: {},
    oauth: {
      authorize_url: "https://vercel.com/integrations/{slug}/new",
      token_url: "https://api.vercel.com/v2/oauth/access_token",
      client_id_env: "VERCEL_CLIENT_ID",
      client_secret_env: "VERCEL_CLIENT_SECRET",
      slug_env: "VERCEL_INTEGRATION_SLUG",
      scope: "",
      format: "json",
    },
  },
  cloudflare: {
    name: "Cloudflare",
    description: "Workers, Pages, R2 and DNS.",
    auth_type: "bearer",
    base_url: "https://api.cloudflare.com/client/v4",
    extra_headers: {},
  },
  shopify: {
    name: "Shopify",
    description: "Optional store connection.",
    auth_type: "shopify_token",
    base_url: null,
    extra_headers: {},
  },
  slack: {
    name: "Slack",
    description: "Channels and messages.",
    auth_type: "bearer",
    base_url: "https://slack.com/api",
    extra_headers: {},
    oauth: {
      authorize_url: "https://slack.com/oauth/v2/authorize",
      token_url: "https://slack.com/api/oauth.v2.access",
      client_id_env: "SLACK_CLIENT_ID",
      client_secret_env: "SLACK_CLIENT_SECRET",
      scope: "chat:write,channels:read",
      format: "form",
    },
  },
  discord: {
    name: "Discord",
    description: "Servers and messages.",
    auth_type: "bot_token",
    base_url: "https://discord.com/api/v10",
    extra_headers: {},
    oauth: {
      authorize_url: "https://discord.com/oauth2/authorize",
      token_url: "https://discord.com/api/oauth2/token",
      client_id_env: "DISCORD_CLIENT_ID",
      client_secret_env: "DISCORD_CLIENT_SECRET",
      scope: "identify webhook.incoming",
      format: "form",
    },
  },
  stripe: {
    name: "Stripe",
    description: "Payments and invoicing.",
    auth_type: "bearer",
    base_url: "https://api.stripe.com/v1",
    extra_headers: {},
  },
  supabase: {
    name: "Supabase",
    description: "Optional database connection.",
    auth_type: "supabase",
    base_url: null,
    extra_headers: {},
  },
  firebase: {
    name: "Firebase",
    description: "Optional Firebase connection.",
    auth_type: "bearer",
    base_url: "https://firestore.googleapis.com/v1",
    extra_headers: {},
    oauth: {
      authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      client_id_env: "GOOGLE_CLIENT_ID",
      client_secret_env: "GOOGLE_CLIENT_SECRET",
      scope: "https://www.googleapis.com/auth/firebase",
      format: "form",
      google: true,
    },
  },
  google_drive: {
    name: "Google Drive",
    description: "Optional external file connection.",
    auth_type: "bearer",
    base_url: "https://www.googleapis.com/drive/v3",
    extra_headers: {},
    oauth: {
      authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
      token_url: "https://oauth2.googleapis.com/token",
      client_id_env: "GOOGLE_CLIENT_ID",
      client_secret_env: "GOOGLE_CLIENT_SECRET",
      scope: "https://www.googleapis.com/auth/drive.file",
      format: "form",
      google: true,
    },
  },
  notion: {
    name: "Notion",
    description: "Optional external workspace connection.",
    auth_type: "bearer",
    base_url: "https://api.notion.com/v1",
    extra_headers: { "Notion-Version": "2022-06-28" },
    oauth: {
      authorize_url: "https://api.notion.com/v1/oauth/authorize",
      token_url: "https://api.notion.com/v1/oauth/token",
      client_id_env: "NOTION_CLIENT_ID",
      client_secret_env: "NOTION_CLIENT_SECRET",
      scope: "",
      format: "notion",
    },
  },
};

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
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function shaKey(env) {
  const secret = env.ENCRYPTION_KEY
    ? String(env.ENCRYPTION_KEY)
    : env.APP_SECRET
      ? `unit369-credential-encryption-v1:${String(env.APP_SECRET)}`
      : "";
  if (!secret)
    throw new Error("APP_SECRET or ENCRYPTION_KEY is not configured.");
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", enc.encode(secret)),
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );
}
async function encrypt(env, obj) {
  const key = await shaKey(env),
    iv = crypto.getRandomValues(new Uint8Array(12)),
    plain = enc.encode(JSON.stringify(obj)),
    cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain),
    ),
    all = new Uint8Array(iv.length + cipher.length);
  all.set(iv);
  all.set(cipher, iv.length);
  return b64url(all);
}
async function decrypt(env, value) {
  try {
    const all = fromB64url(value),
      key = await shaKey(env),
      plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: all.slice(0, 12) },
        key,
        all.slice(12),
      );
    return JSON.parse(dec.decode(plain));
  } catch {
    return null;
  }
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
  const aa = new Uint8Array(
      await crypto.subtle.digest("SHA-256", enc.encode(String(a))),
    ),
    bb = new Uint8Array(
      await crypto.subtle.digest("SHA-256", enc.encode(String(b))),
    );
  let n = 0;
  for (let i = 0; i < aa.length; i++) n |= aa[i] ^ bb[i];
  return n === 0;
}
async function session(request, env) {
  const account = await resolveAccount(request, env);
  return account ? { sid: account.uid, account } : null;
}
function store(env, sid) {
  if (!env.TOOL_STORE) throw new Error("TOOL_STORE binding is not configured.");
  return env.TOOL_STORE.get(env.TOOL_STORE.idFromName(sid));
}
async function saveAuth(env, sid, toolId, auth) {
  const response = await store(env, sid).fetch(
    "https://store/token/" + encodeURIComponent(toolId),
    { method: "PUT", body: await encrypt(env, auth) },
  );
  if (!response.ok)
    throw new Error("Connection credentials could not be saved.");
}
async function loadAuth(env, sid, toolId) {
  const r = await store(env, sid).fetch(
    "https://store/token/" + encodeURIComponent(toolId),
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("Connection credentials could not be loaded.");
  const bytes = await readStreamLimited(
    r.body,
    64 * 1024,
    Number(r.headers.get("content-length") || 0),
  );
  return decrypt(env, dec.decode(bytes));
}
async function deleteAuth(env, sid, toolId) {
  const response = await store(env, sid).fetch(
    "https://store/token/" + encodeURIComponent(toolId),
    { method: "DELETE" },
  );
  if (!response.ok)
    throw new Error("Connection credentials could not be removed.");
}
function oauthAvailable(env, cfg) {
  if (!cfg.oauth) return false;
  if (cfg.oauth.slug_env && !env[cfg.oauth.slug_env]) return false;
  return !!(env[cfg.oauth.client_id_env] && env[cfg.oauth.client_secret_env]);
}
function sanitizeReturnTo(raw, origin) {
  try {
    const u = new URL(raw || "/", origin);
    if (u.origin !== origin) return origin + "/";
    const destination = `${origin}${u.pathname}${u.search}${u.hash}`;
    return destination.length <= 2_048 ? destination : origin + "/";
  } catch {
    return origin + "/";
  }
}
async function makeState(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload))),
    sig = await hmac(env, body);
  return `${body}.${sig}`;
}
async function parseState(env, state) {
  const raw = String(state || "");
  if (raw.length > 16_384) return null;
  const i = raw.lastIndexOf(".");
  if (i < 1) return null;
  const body = raw.slice(0, i),
    sig = raw.slice(i + 1);
  if (!(await safeEqual(sig, await hmac(env, body)))) return null;
  try {
    const p = JSON.parse(dec.decode(fromB64url(body)));
    if (!p.exp || Date.now() > p.exp) return null;
    return p;
  } catch {
    return null;
  }
}
function authHeaders(cfg, a) {
  const h = { ...cfg.extra_headers };
  if (cfg.auth_type === "bearer")
    h.Authorization = `Bearer ${a.access_token || a.api_key || a.token || ""}`;
  if (cfg.auth_type === "bot_token")
    h.Authorization = `Bot ${a.bot_token || a.access_token || a.token || ""}`;
  if (cfg.auth_type === "shopify_token")
    h["X-Shopify-Access-Token"] = a.access_token || a.token || "";
  if (cfg.auth_type === "supabase") {
    h.apikey = a.api_key || "";
    h.Authorization = `Bearer ${a.api_key || ""}`;
  }
  return h;
}
function toolBase(id, cfg, input) {
  if (id === "shopify") {
    const shop = String(input.shop_domain || "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop))
      throw new Error("A valid *.myshopify.com shop_domain is required.");
    return `https://${shop}/admin/api/2025-10`;
  }
  if (id === "supabase") {
    const ref = String(input.project_ref || "").toLowerCase();
    if (!/^[a-z0-9-]{8,80}$/.test(ref))
      throw new Error("A valid Supabase project_ref is required.");
    return `https://${ref}.supabase.co/rest/v1`;
  }
  return cfg.base_url;
}
function normalizeManualAuth(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(
      400,
      "Connection credentials must be an object.",
      "invalid_auth",
    );
  }
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 20) {
    throw new HttpError(
      400,
      "Connection credentials contain an invalid number of fields.",
      "invalid_auth",
    );
  }
  const auth = {};
  for (const [key, raw] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) {
      throw new HttpError(
        400,
        "Connection credential field name is invalid.",
        "invalid_auth",
      );
    }
    if (typeof raw !== "string" || !raw.trim() || raw.length > 16_384) {
      throw new HttpError(
        400,
        `Connection credential ${key} is invalid.`,
        "invalid_auth",
      );
    }
    auth[key] = raw.trim();
  }
  return auth;
}
function normalizeExternalAction(input) {
  const id = String(input.tool_id || ""),
    cfg = TOOLS[id];
  if (!cfg)
    throw new HttpError(400, "Unknown external connection.", "unknown_tool");
  const method = String(input.method || "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
    throw new HttpError(400, "Unsupported method.", "unsupported_method");
  const path = String(input.path || "");
  if (
    path.length > 4_096 ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\")
  )
    throw new HttpError(400, "Invalid API path.", "invalid_api_path");
  return {
    tool_id: id,
    method,
    path,
    body: input.body ?? null,
    shop_domain: input.shop_domain || null,
    project_ref: input.project_ref || null,
  };
}

async function executeAdapter(env, sid, input) {
  const { tool_id: id, method, path } = input,
    cfg = TOOLS[id];
  const auth = await loadAuth(env, sid, id);
  if (!auth)
    return {
      error: `${cfg.name} is not connected.`,
      error_status: 409,
    };
  let base;
  try {
    base = toolBase(id, cfg, input);
  } catch (e) {
    return { error: e.message, error_status: 400 };
  }
  const h = authHeaders(cfg, auth);
  if (input.body != null)
    h["content-type"] = h["content-type"] || "application/json";
  const ctrl = new AbortController(),
    timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(base + path, {
        method,
        headers: h,
        body: input.body != null ? JSON.stringify(input.body) : undefined,
        signal: ctrl.signal,
      }),
      declared = Number(r.headers.get("content-length") || 0),
      bytes = await readStreamLimited(r.body, 512 * 1024, declared),
      text = dec.decode(bytes);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text.slice(0, 12000);
    }
    return { external: true, tool_id: id, status: r.status, ok: r.ok, data };
  } catch (e) {
    return {
      external: true,
      tool_id: id,
      error_status: e.name === "AbortError" ? 504 : 502,
      error:
        e.name === "AbortError"
          ? "External API request timed out after 15 seconds."
          : String(e.message || e),
    };
  } finally {
    clearTimeout(timer);
  }
}
async function oauthStart(request, env, url, s) {
  const id = url.pathname.split("/").pop(),
    cfg = TOOLS[id];
  if (!cfg?.oauth)
    return json({ error: "OAuth is not available for this connection." }, 400);
  if (!oauthAvailable(env, cfg))
    return json(
      { error: `OAuth credentials for ${cfg.name} are not configured.` },
      503,
    );
  let authUrl = cfg.oauth.authorize_url;
  if (cfg.oauth.slug_env)
    authUrl = authUrl.replace(
      "{slug}",
      encodeURIComponent(env[cfg.oauth.slug_env]),
    );
  const callback = `${url.origin}/api/orchestrator/oauth/callback/${id}`,
    returnTo = sanitizeReturnTo(
      url.searchParams.get("return_to") || "/?connected=" + id,
      url.origin,
    ),
    state = await makeState(env, {
      sid: s.sid,
      tool: id,
      returnTo,
      exp: Date.now() + 10 * 60 * 1000,
      nonce: b64url(crypto.getRandomValues(new Uint8Array(12))),
    }),
    a = new URL(authUrl);
  a.searchParams.set("client_id", env[cfg.oauth.client_id_env]);
  a.searchParams.set("redirect_uri", callback);
  a.searchParams.set("state", state);
  if (cfg.oauth.scope) a.searchParams.set("scope", cfg.oauth.scope);
  a.searchParams.set("response_type", "code");
  if (cfg.oauth.google) {
    a.searchParams.set("access_type", "offline");
    a.searchParams.set("prompt", "consent");
  }
  return Response.redirect(a.toString(), 302);
}
async function exchangeOAuth(env, cfg, code, callback) {
  const clientId = env[cfg.oauth.client_id_env],
    secret = env[cfg.oauth.client_secret_env],
    payload = {
      client_id: clientId,
      client_secret: secret,
      code,
      redirect_uri: callback,
      grant_type: "authorization_code",
    },
    controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15_000),
    send = async (init) => {
      try {
        const response = await fetch(cfg.oauth.token_url, {
          ...init,
          signal: controller.signal,
        });
        return {
          r: response,
          d: await readResponseJsonLimited(response, 256 * 1024),
        };
      } finally {
        clearTimeout(timer);
      }
    };
  if (cfg.oauth.format === "notion") {
    return send({
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${clientId}:${secret}`),
        "content-type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: callback,
      }),
    });
  }
  if (cfg.oauth.format === "form") {
    return send({
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(payload),
    });
  }
  return send({
    method: "POST",
    headers: { "content-type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
}
async function oauthCallback(request, env, url) {
  const id = url.pathname.split("/").pop(),
    cfg = TOOLS[id],
    state = await parseState(env, url.searchParams.get("state")),
    account = await resolveAccount(request, env);
  if (
    !cfg?.oauth ||
    !state ||
    state.tool !== id ||
    !account ||
    account.uid !== state.sid
  )
    return json({ error: "Invalid or expired OAuth state." }, 400);
  const code = String(url.searchParams.get("code") || "").slice(0, 4_096);
  if (!code)
    return json(
      {
        error:
          url.searchParams.get("error") ||
          "OAuth authorization was not completed.",
      },
      400,
    );
  const callback = `${url.origin}/api/orchestrator/oauth/callback/${id}`,
    { r, d } = await exchangeOAuth(env, cfg, code, callback);
  if (!r.ok || d.error)
    return json(
      {
        error:
          d.error_description ||
          d.error ||
          `Token exchange failed for ${cfg.name}.`,
      },
      400,
    );
  await saveAuth(env, state.sid, id, d);
  const dest = new URL(sanitizeReturnTo(state.returnTo, url.origin));
  dest.searchParams.set("connected", id);
  return Response.redirect(dest.toString(), 302);
}

export async function handleOrchestrator(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/orchestrator/oauth/callback/"))
    return oauthCallback(request, env, url);
  if (url.pathname === "/api/orchestrator/health") {
    const a = await resolveAccount(request, env);
    return json({
      ok: true,
      storage: !!env.TOOL_STORE,
      authenticated: !!a,
      account_required: true,
      brain: "unit369-native",
      external_role: "execution-adapter",
    });
  }
  let s;
  try {
    s = await session(request, env);
  } catch (e) {
    return json({ error: String(e.message || e) }, 503);
  }
  if (!s)
    return json(
      {
        error: "Sign in to Unit369 to use external connections.",
        login_url: "/account",
      },
      401,
    );
  if (url.pathname.startsWith("/api/orchestrator/oauth/start/"))
    return oauthStart(request, env, url, s);
  if (url.pathname === "/api/orchestrator/tools" && request.method === "GET") {
    try {
      const list = [];
      for (const [id, cfg] of Object.entries(TOOLS))
        list.push({
          id,
          name: cfg.name,
          description: cfg.description,
          connected: !!(await loadAuth(env, s.sid, id)),
          oauth_available: oauthAvailable(env, cfg),
          manual_available: true,
          optional: true,
        });
      return json({
        tools: list,
        brain: "unit369-native",
        external_only: true,
        user: {
          id: s.account.uid,
          email: s.account.email,
          name: s.account.name,
        },
      });
    } catch (e) {
      return json({ error: String(e.message || e) }, 503);
    }
  }
  if (
    url.pathname === "/api/orchestrator/connect" &&
    request.method === "POST"
  ) {
    try {
      const b = await readJsonLimited(request, 64 * 1024);
      if (!TOOLS[b?.toolId] || !b?.auth || typeof b.auth !== "object")
        return json({ error: "toolId and auth are required." }, 400);
      await saveAuth(env, s.sid, b.toolId, normalizeManualAuth(b.auth));
      return json({ ok: true, connected: b.toolId, optional: true });
    } catch (e) {
      return json(
        { error: String(e.message || e), code: e.code || "connect_error" },
        e instanceof HttpError ? e.status : 500,
      );
    }
  }
  if (
    url.pathname === "/api/orchestrator/disconnect" &&
    request.method === "POST"
  ) {
    try {
      const b = await readJsonLimited(request, 8 * 1024);
      if (!TOOLS[b?.toolId]) return json({ error: "Unknown connection." }, 400);
      await deleteAuth(env, s.sid, b.toolId);
      return json({ ok: true, disconnected: b.toolId });
    } catch (e) {
      return json(
        { error: String(e.message || e), code: e.code || "disconnect_error" },
        e instanceof HttpError ? e.status : 500,
      );
    }
  }
  if (
    url.pathname === "/api/orchestrator/execute" &&
    request.method === "POST"
  ) {
    try {
      const b = await readJsonLimited(request, 64 * 1024);
      let action;
      if (b?.approval_id || b?.approval_token) {
        if (!b.approval_id || !b.approval_token)
          return json(
            { error: "approval_id and approval_token are both required." },
            400,
          );
        const consumed = await consumeApproval(
          env,
          s.sid,
          "external-execution",
          String(b.approval_id),
          String(b.approval_token),
        );
        action = normalizeExternalAction(consumed.action || {});
      } else {
        if (!b?.tool_id || !b?.method || !b?.path)
          return json({ error: "tool_id, method and path are required." }, 400);
        action = normalizeExternalAction(b);
        if (action.method !== "GET") {
          const approval = await requestApproval(
            env,
            s.sid,
            "external-execution",
            action,
          );
          return json(
            {
              approval_required: true,
              external: true,
              message:
                "Review and explicitly confirm this external write before it runs.",
              action,
              approval,
            },
            202,
          );
        }
      }
      const out = await executeAdapter(env, s.sid, action);
      return json(out, out.error ? out.error_status || 400 : 200);
    } catch (e) {
      return json(
        { error: String(e.message || e), code: e.code || "execution_error" },
        e instanceof HttpError ? e.status : 500,
      );
    }
  }
  if (url.pathname === "/api/orchestrator/chat")
    return json(
      {
        error:
          "External orchestrator chat is retired. Unit369 native Chat and /api/native/execute are the intelligence layer.",
        brain: "unit369-native",
        external_execute: "/api/orchestrator/execute",
      },
      410,
    );
  return null;
}
