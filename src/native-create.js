import { readJsonLimited, readResponseJsonLimited } from "./runtime-utils.js";

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
function clean(v, max = 4000) {
  return String(v ?? "")
    .trim()
    .slice(0, max);
}
function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function arr(v, max = 128) {
  return Array.isArray(v) ? v.slice(0, max) : [];
}
function validId(v) {
  return /^[A-Za-z0-9._:-]{1,160}$/.test(String(v || ""));
}
function esc(v) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}
function num(v, d = 0, min = -10000, max = 10000) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
}
function store(env, uid) {
  if (!env.NATIVE_STORE)
    throw new Error("NATIVE_STORE binding is not configured.");
  return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid));
}
async function call(env, uid, path, init = {}) {
  const r = await store(env, uid).fetch(
    new Request("https://native.internal/native-store" + path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    }),
  );
  const d = await readResponseJsonLimited(r, 8 * 1024 * 1024);
  return { r, d };
}
const COLLECTION = "__unit369_create_v1";
async function collection(env, uid) {
  let x = await call(env, uid, "/data/collections?limit=200");
  let c = (x.d.collections || []).find((v) => v.name === COLLECTION);
  if (c) return c;
  x = await call(env, uid, "/data/collections", {
    method: "POST",
    body: JSON.stringify({
      name: COLLECTION,
      schema: {
        type: "design|presentation",
        width: "number",
        height: "number",
        elements: "array",
        slides: "array",
        brand: "object",
      },
    }),
  });
  if (!x.r.ok) throw new Error(x.d.error || "Create store unavailable");
  return x.d.collection;
}
async function rows(env, uid, cid) {
  const x = await call(env, uid, `/data/collections/${cid}/records?limit=200`);
  if (!x.r.ok) throw new Error(x.d.error || "Create records unavailable");
  return x.d.records || [];
}
async function get(env, uid, cid, id) {
  const x = await call(env, uid, `/data/collections/${cid}/records/${id}`);
  return x.r.ok ? x.d.record : null;
}
function designRecord(r) {
  const d = r.data || {};
  return {
    id: r.id,
    name: r.name,
    width: num(d.width, 1080, 64, 4096),
    height: num(d.height, 1080, 64, 4096),
    background: clean(d.background || "#0b1020", 64),
    elements: arr(d.elements),
    brand: obj(d.brand),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function presentationRecord(r) {
  const d = r.data || {};
  return {
    id: r.id,
    name: r.name,
    aspect: clean(d.aspect || "16:9", 16),
    slides: arr(d.slides, 100),
    brand: obj(d.brand),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
function renderElement(e) {
  const x = obj(e),
    type = clean(x.type, 20);
  if (type === "text") {
    return `<text x="${num(x.x, 40)}" y="${num(x.y, 80)}" font-size="${num(x.size, 48, 6, 400)}" font-family="Arial, sans-serif" font-weight="${esc(clean(x.weight || "600", 16))}" fill="${esc(clean(x.fill || "#ffffff", 64))}" text-anchor="${esc(clean(x.anchor || "start", 16))}">${esc(clean(x.text, 4000))}</text>`;
  }
  if (type === "rect") {
    return `<rect x="${num(x.x)}" y="${num(x.y)}" width="${num(x.width, 100, 0, 4096)}" height="${num(x.height, 100, 0, 4096)}" rx="${num(x.radius, 0, 0, 1000)}" fill="${esc(clean(x.fill || "#2563eb", 64))}" opacity="${num(x.opacity, 1, 0, 1)}"/>`;
  }
  if (type === "circle") {
    return `<circle cx="${num(x.cx, 100)}" cy="${num(x.cy, 100)}" r="${num(x.r, 50, 0, 2048)}" fill="${esc(clean(x.fill || "#2563eb", 64))}" opacity="${num(x.opacity, 1, 0, 1)}"/>`;
  }
  if (type === "line") {
    return `<line x1="${num(x.x1)}" y1="${num(x.y1)}" x2="${num(x.x2, 100)}" y2="${num(x.y2, 100)}" stroke="${esc(clean(x.stroke || "#ffffff", 64))}" stroke-width="${num(x.strokeWidth, 2, 0, 100)}"/>`;
  }
  return "";
}
function svg(design) {
  const w = num(design.width, 1080, 64, 4096),
    h = num(design.height, 1080, 64, 4096),
    els = arr(design.elements).map(renderElement).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="${esc(clean(design.background || "#0b1020", 64))}"/>${els}</svg>`;
}
export async function handleNativeCreate(request, env, account) {
  const u = new URL(request.url),
    p = u.pathname
      .replace(/^\/api\/native\/create\/?/, "")
      .split("/")
      .filter(Boolean),
    cid = (await collection(env, account.uid)).id;
  if (!p.length)
    return json({
      domains: ["designs", "presentations"],
      renderer: "unit369-svg",
      external_required: false,
    });
  const group = p[0];
  if (!["designs", "presentations"].includes(group))
    return json({ error: "Create route not found." }, 404);
  const kind = group === "designs" ? "design" : "presentation";
  if (p.length === 1) {
    if (request.method === "GET") {
      const all = (await rows(env, account.uid, cid)).filter(
        (r) => r.data?.type === kind,
      );
      return json({
        [group]: all.map(kind === "design" ? designRecord : presentationRecord),
      });
    }
    if (request.method === "POST") {
      const b = await readJsonLimited(request, 512 * 1024),
        name = clean(b.name || "Untitled", 200);
      let data;
      if (kind === "design")
        data = {
          type: "design",
          name,
          width: num(b.width, 1080, 64, 4096),
          height: num(b.height, 1080, 64, 4096),
          background: clean(b.background || "#0b1020", 64),
          elements: arr(b.elements),
          brand: obj(b.brand),
        };
      else
        data = {
          type: "presentation",
          name,
          aspect: clean(b.aspect || "16:9", 16),
          slides: arr(b.slides, 100),
          brand: obj(b.brand),
        };
      const x = await call(
        env,
        account.uid,
        `/data/collections/${cid}/records`,
        { method: "POST", body: JSON.stringify({ name, record: data }) },
      );
      if (!x.r.ok) return json(x.d, x.r.status);
      return json(
        {
          [kind]:
            kind === "design"
              ? designRecord(x.d.record)
              : presentationRecord(x.d.record),
        },
        201,
      );
    }
    return json({ error: "Method not allowed." }, 405);
  }
  const id = p[1];
  if (!validId(id)) return json({ error: "Invalid id." }, 400);
  const r = await get(env, account.uid, cid, id);
  if (!r || r.data?.type !== kind)
    return json({ error: "Asset not found." }, 404);
  if (group === "designs" && p[2] === "render" && request.method === "GET") {
    return new Response(svg(designRecord(r)), {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  }
  if (request.method === "GET")
    return json({
      [kind]: kind === "design" ? designRecord(r) : presentationRecord(r),
    });
  if (request.method === "PUT") {
    const b = await readJsonLimited(request, 512 * 1024),
      old = r.data || {},
      name = clean(b.name || r.name, 200);
    let data;
    if (kind === "design")
      data = {
        ...old,
        ...obj(b),
        type: "design",
        name,
        width: num(b.width ?? old.width, 1080, 64, 4096),
        height: num(b.height ?? old.height, 1080, 64, 4096),
        background: clean(b.background ?? old.background, 64),
        elements:
          b.elements === undefined ? arr(old.elements) : arr(b.elements),
        brand: b.brand === undefined ? obj(old.brand) : obj(b.brand),
      };
    else
      data = {
        ...old,
        ...obj(b),
        type: "presentation",
        name,
        aspect: clean(b.aspect ?? old.aspect, 16),
        slides:
          b.slides === undefined ? arr(old.slides, 100) : arr(b.slides, 100),
        brand: b.brand === undefined ? obj(old.brand) : obj(b.brand),
      };
    const x = await call(
      env,
      account.uid,
      `/data/collections/${cid}/records/${id}`,
      { method: "PUT", body: JSON.stringify({ name, record: data }) },
    );
    if (!x.r.ok) return json(x.d, x.r.status);
    return json({ [kind]: { id, name, ...data, updated_at: Date.now() } });
  }
  if (request.method === "DELETE") {
    const x = await call(
      env,
      account.uid,
      `/data/collections/${cid}/records/${id}`,
      { method: "DELETE" },
    );
    return json(x.d, x.r.status);
  }
  return json({ error: "Method not allowed." }, 405);
}
