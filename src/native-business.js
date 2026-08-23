import { readJsonLimited, readResponseJsonLimited } from "./runtime-utils.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
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
function validId(v) {
  return /^[A-Za-z0-9._:-]{1,160}$/.test(String(v || ""));
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
const COLLECTION = "__unit369_business_v1";
async function collection(env, uid) {
  let x = await call(env, uid, "/data/collections?limit=200");
  let c = (x.d.collections || []).find((v) => v.name === COLLECTION);
  if (c) return c;
  x = await call(env, uid, "/data/collections", {
    method: "POST",
    body: JSON.stringify({
      name: COLLECTION,
      schema: {
        type: "contact|lead|product|order|invoice",
        status: "string",
        amount: "number",
        currency: "string",
      },
    }),
  });
  if (!x.r.ok) throw new Error(x.d.error || "Business store unavailable");
  return x.d.collection;
}
async function rows(env, uid, cid) {
  const x = await call(env, uid, `/data/collections/${cid}/records?limit=200`);
  if (!x.r.ok) throw new Error(x.d.error || "Business records unavailable");
  return x.d.records || [];
}
async function get(env, uid, cid, id) {
  const x = await call(env, uid, `/data/collections/${cid}/records/${id}`);
  return x.r.ok ? x.d.record : null;
}
function normalize(r) {
  return {
    id: r.id,
    name: r.name,
    data: r.data || {},
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
const TYPES = new Set(["contacts", "leads", "products", "orders", "invoices"]);
const singular = {
  contacts: "contact",
  leads: "lead",
  products: "product",
  orders: "order",
  invoices: "invoice",
};
export async function handleNativeBusiness(request, env, account) {
  const u = new URL(request.url),
    p = u.pathname
      .replace(/^\/api\/native\/business\/?/, "")
      .split("/")
      .filter(Boolean),
    cid = (await collection(env, account.uid)).id;
  if (!p.length && request.method === "GET") {
    const all = await rows(env, account.uid, cid),
      summary = {};
    for (const k of TYPES)
      summary[k] = all.filter((r) => r.data?.type === singular[k]).length;
    summary.order_total = all
      .filter((r) => r.data?.type === "order")
      .reduce((n, r) => n + Number(r.data?.total || 0), 0);
    summary.leads_open = all.filter(
      (r) =>
        r.data?.type === "lead" &&
        !["won", "lost", "closed"].includes(r.data?.status),
    ).length;
    return json({ summary });
  }
  const type = p[0];
  if (!TYPES.has(type))
    return json({ error: "Business route not found." }, 404);
  const kind = singular[type];
  if (p.length === 1) {
    if (request.method === "GET") {
      const q = clean(u.searchParams.get("q"), 120).toLowerCase(),
        all = (await rows(env, account.uid, cid)).filter(
          (r) => r.data?.type === kind,
        ),
        out = q
          ? all.filter((r) => JSON.stringify(r).toLowerCase().includes(q))
          : all;
      return json({ [type]: out.map(normalize) });
    }
    if (request.method === "POST") {
      const b = await readJsonLimited(request, 256 * 1024),
        name = clean(b.name || b.title || b.email, 200);
      if (!name) return json({ error: "Name is required." }, 400);
      const data = { ...obj(b), type: kind, name };
      if (kind === "product") {
        data.price = Number(b.price || 0);
        data.stock = Number(b.stock || 0);
        data.currency = clean(b.currency || "USD", 12);
      }
      if (kind === "order") {
        data.total = Number(b.total || 0);
        data.currency = clean(b.currency || "USD", 12);
        data.status = clean(b.status || "draft", 40);
      }
      if (kind === "lead") data.status = clean(b.status || "new", 40);
      const x = await call(
        env,
        account.uid,
        `/data/collections/${cid}/records`,
        { method: "POST", body: JSON.stringify({ name, record: data }) },
      );
      if (!x.r.ok) return json(x.d, x.r.status);
      return json({ [kind]: normalize(x.d.record) }, 201);
    }
    return json({ error: "Method not allowed." }, 405);
  }
  const id = p[1];
  if (!validId(id)) return json({ error: "Invalid id." }, 400);
  const r = await get(env, account.uid, cid, id);
  if (!r || r.data?.type !== kind)
    return json({ error: "Record not found." }, 404);
  if (request.method === "GET") return json({ [kind]: normalize(r) });
  if (request.method === "PUT") {
    const b = await readJsonLimited(request, 256 * 1024),
      name = clean(b.name || r.name, 200),
      data = { ...r.data, ...obj(b), type: kind, name };
    if (kind === "product") {
      data.price = Number(data.price || 0);
      data.stock = Number(data.stock || 0);
    }
    if (kind === "order") data.total = Number(data.total || 0);
    const x = await call(
      env,
      account.uid,
      `/data/collections/${cid}/records/${id}`,
      { method: "PUT", body: JSON.stringify({ name, record: data }) },
    );
    if (!x.r.ok) return json(x.d, x.r.status);
    return json({ [kind]: { id, name, data, updated_at: Date.now() } });
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
