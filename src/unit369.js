import ui from "./enhancements.js";

const APP_VERSION = "2026.08.22.2";
const LOGO_ORIGINAL = "https://cdn.shopify.com/s/files/1/1026/5047/8921/files/unit369-exact-logo.jpg?v=1787373410";

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra }
  });
}

function safeError(error) {
  return String(error?.message || error || "Nepoznata greška").slice(0, 600);
}

function manifest() {
  return {
    id: "/",
    name: "Unit369",
    short_name: "Unit369",
    description: "AI tim i upravljanje proizvodima.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#05070c",
    theme_color: "#05070c",
    orientation: "portrait-primary",
    icons: [
      { src: "/app-icon-192.jpg?v=" + APP_VERSION, sizes: "192x192", type: "image/jpeg", purpose: "any maskable" },
      { src: "/app-icon-512.jpg?v=" + APP_VERSION, sizes: "512x512", type: "image/jpeg", purpose: "any maskable" }
    ]
  };
}

function serviceWorker() {
  return `const CACHE='unit369-${APP_VERSION}';\nself.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/manifest.json'])))});\nself.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));\nself.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin!==location.origin)return;e.respondWith((async()=>{try{const r=await fetch(e.request);const c=await caches.open(CACHE);if(r.ok)c.put(e.request,r.clone());return r}catch{return (await caches.match(e.request))||Response.error()}})())});`;
}

async function proxyLogo(size) {
  const url = size === 192 ? "https://cdn.shopify.com/s/files/1/1026/5047/8921/files/unit369-192-exact_3bed4afa-03b4-411c-9458-d14bbf667a60.jpg?v=1787374342" : size === 512 ? "https://cdn.shopify.com/s/files/1/1026/5047/8921/files/unit369-512-exact_6038ed5d-ecf6-4a2d-add1-25e26fb0642c.jpg?v=1787374350" : LOGO_ORIGINAL;
  const upstream = await fetch(url);
  if (!upstream.ok) {
    const fallback = await fetch(LOGO_ORIGINAL);
    if (!fallback.ok) return new Response("", { status: 404 });
    return new Response(fallback.body, { headers: { "content-type": "image/jpeg", "cache-control": "public,max-age=31536000,immutable" } });
  }
  return new Response(upstream.body, { headers: { "content-type": "image/jpeg", "cache-control": "public,max-age=31536000,immutable" } });
}

function providerKey(env, provider) {
  if (provider === "openai") return env.OPENAI_API_KEY;
  if (provider === "grok") return env.GROK_API_KEY || env.XAI_API_KEY;
  if (provider === "claude") return env.ANTHROPIC_API_KEY;
  return null;
}

async function aiProxy(request, env) {
  try {
    const incoming = await request.json();
    const provider = String(incoming.provider || request.headers.get("x-provider") || "openai").toLowerCase();
    const key = providerKey(env, provider);
    if (!key) return json({ error: `${provider.toUpperCase()} server key nije podešen.` }, 503);
    const messages = Array.isArray(incoming.messages) ? incoming.messages : [];
    const max_tokens = Math.min(Math.max(Number(incoming.max_tokens) || 1200, 64), 3000);

    if (provider === "claude") {
      const systemParts = messages.filter(m => m.role === "system").map(m => String(m.content || ""));
      const userMessages = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") }));
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": String(key).trim(), "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: incoming.model || env.ANTHROPIC_MODEL || "claude-sonnet-4-6", max_tokens, system: systemParts.join("\n\n"), messages: userMessages })
      });
      const data = await upstream.json();
      if (!upstream.ok) return json({ error: data?.error?.message || "Claude zahtev nije uspeo." }, upstream.status);
      return json({ provider, model: data.model, content: (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim() });
    }

    const endpoint = provider === "grok" ? "https://api.x.ai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const defaultModel = provider === "grok" ? (env.GROK_MODEL || "grok-4") : (env.OPENAI_MODEL || "gpt-5.2");
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${String(key).trim()}` },
      body: JSON.stringify({ model: incoming.model || defaultModel, messages, max_tokens })
    });
    const data = await upstream.json();
    if (!upstream.ok) return json({ error: data?.error?.message || `${provider} zahtev nije uspeo.` }, upstream.status);
    return json({ provider, model: data.model, content: data.choices?.[0]?.message?.content?.trim() || "" });
  } catch (error) {
    return json({ error: safeError(error) }, 500);
  }
}

async function freeAi(request, env) {
  try {
    if (!env.AI) return json({ error: "Workers AI binding nije podešen." }, 503);
    const incoming = await request.json();
    const messages = Array.isArray(incoming.messages) ? incoming.messages : [];
    const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages, max_tokens: 1200 });
    return json({ provider: "workers-ai", model: "llama-3.3-70b", content: String(result?.response || "").trim() });
  } catch (error) {
    return json({ error: safeError(error) }, 500);
  }
}

async function getShopifyToken(env) {
  if (!env.SHOPIFY_SHOP || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) throw new Error("Shopify integracija nije kompletno podešena.");
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: "client_credentials" })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error("Shopify autentikacija nije uspela.");
  return data.access_token;
}

async function shopifyGraphQL(env, token, query, variables = {}) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/2025-10/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query, variables })
  });
  const payload = await res.json();
  if (!res.ok || payload.errors?.length) throw new Error(payload.errors?.[0]?.message || "Shopify GraphQL greška.");
  return payload.data;
}

async function stagedUpload(env, token, file, resource) {
  const mimeType = file.type || (resource === "VIDEO" ? "video/mp4" : "image/jpeg");
  const filename = String(file.name || `${resource.toLowerCase()}-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  const data = await shopifyGraphQL(env, token, `mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`, {
    input: [{ filename, mimeType, resource, httpMethod: "POST", fileSize: String(file.size) }]
  });
  const result = data.stagedUploadsCreate;
  if (result.userErrors?.length) throw new Error(result.userErrors[0].message);
  const target = result.stagedTargets?.[0];
  if (!target) throw new Error("Shopify nije vratio upload lokaciju.");
  const form = new FormData();
  target.parameters.forEach(p => form.append(p.name, p.value));
  form.append("file", file, filename);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Upload nije uspeo (${upload.status}).`);
  return { resourceUrl: target.resourceUrl, filename };
}

async function listProducts(env) {
  try {
    const token = await getShopifyToken(env);
    const data = await shopifyGraphQL(env, token, `query{products(first:30,sortKey:UPDATED_AT,reverse:true){nodes{id title handle status productType vendor updatedAt featuredMedia{preview{image{url}}} variants(first:20){nodes{id title price sku inventoryQuantity}}}}}`);
    return json({ products: data.products?.nodes || [] });
  } catch (error) { return json({ error: safeError(error) }, 500); }
}

async function createProduct(request, env) {
  try {
    const form = await request.formData();
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const price = Number(String(form.get("price") || "").replace(",", "."));
    const sizes = String(form.get("sizes") || "").split(",").map(v => v.trim()).filter(Boolean);
    const status = String(form.get("status") || "DRAFT").toUpperCase() === "ACTIVE" ? "ACTIVE" : "DRAFT";
    const productType = String(form.get("productType") || "").trim();
    const vendor = String(form.get("vendor") || "").trim();
    const skuBase = String(form.get("sku") || "").trim();
    const tags = String(form.get("tags") || "").split(",").map(v => v.trim()).filter(Boolean);
    if (!title) return json({ error: "Naziv proizvoda je obavezan." }, 400);
    if (!Number.isFinite(price) || price <= 0) return json({ error: "Cena mora biti broj veći od nule." }, 400);
    if (!sizes.length) return json({ error: "Unesi najmanje jednu veličinu." }, 400);

    const token = await getShopifyToken(env);
    const created = await shopifyGraphQL(env, token, `mutation($product:ProductCreateInput!){productCreate(product:$product){product{id title handle variants(first:50){nodes{id title}}} userErrors{field message}}}`, {
      product: {
        title,
        descriptionHtml: description ? `<p>${description.replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]))}</p>` : "",
        status,
        productType: productType || undefined,
        vendor: vendor || undefined,
        tags,
        productOptions: [{ name: "Veličina", values: sizes.map(name => ({ name })) }]
      }
    });
    if (created.productCreate.userErrors?.length) throw new Error(created.productCreate.userErrors[0].message);
    const product = created.productCreate.product;
    const variants = product.variants?.nodes || [];
    if (variants.length) {
      const variantPayload = variants.map((v, i) => ({ id: v.id, price: price.toFixed(2), sku: skuBase ? `${skuBase}-${sizes[i] || i + 1}` : undefined }));
      const updated = await shopifyGraphQL(env, token, `mutation($productId:ID!,$variants:[ProductVariantsBulkInput!]!){productVariantsBulkUpdate(productId:$productId,variants:$variants){userErrors{message}}}`, { productId: product.id, variants: variantPayload });
      if (updated.productVariantsBulkUpdate.userErrors?.length) throw new Error(updated.productVariantsBulkUpdate.userErrors[0].message);
    }

    const media = [];
    for (const file of form.getAll("images")) {
      if (file && typeof file !== "string" && file.size) {
        const target = await stagedUpload(env, token, file, "IMAGE");
        media.push({ originalSource: target.resourceUrl, mediaContentType: "IMAGE", alt: title });
      }
    }
    const video = form.get("video");
    if (video && typeof video !== "string" && video.size) {
      const target = await stagedUpload(env, token, video, "VIDEO");
      media.push({ originalSource: target.resourceUrl, mediaContentType: "VIDEO", alt: title });
    }
    if (media.length) {
      const attached = await shopifyGraphQL(env, token, `mutation($productId:ID!,$media:[CreateMediaInput!]!){productCreateMedia(productId:$productId,media:$media){mediaUserErrors{message}}}`, { productId: product.id, media });
      if (attached.productCreateMedia.mediaUserErrors?.length) throw new Error(attached.productCreateMedia.mediaUserErrors[0].message);
    }
    const numericId = String(product.id).split("/").pop();
    const shopHandle = String(env.SHOPIFY_SHOP).split(".")[0];
    return json({ ok: true, product: { id: product.id, title: product.title, handle: product.handle, status }, adminUrl: `https://admin.shopify.com/store/${shopHandle}/products/${numericId}` });
  } catch (error) { return json({ error: safeError(error) }, 500); }
}

function integrationStatus(env) {
  return {
    version: APP_VERSION,
    integrations: {
      claude: !!env.ANTHROPIC_API_KEY,
      openai: !!env.OPENAI_API_KEY,
      grok: !!(env.GROK_API_KEY || env.XAI_API_KEY),
      workersAi: !!env.AI,
      shopify: !!(env.SHOPIFY_SHOP && env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET)
    }
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/debug-key") return new Response("Not Found", { status: 404 });
    if (url.pathname === "/api/status" && request.method === "GET") return json(integrationStatus(env));
    if (url.pathname === "/api/ai-proxy" && request.method === "POST") return aiProxy(request, env);
    if (url.pathname === "/api/free-ai" && request.method === "POST") return freeAi(request, env);
    if (url.pathname === "/api/products" && request.method === "GET") return listProducts(env);
    if (url.pathname === "/api/create-product" && request.method === "POST") return createProduct(request, env);
    if (url.pathname === "/manifest.json") return new Response(JSON.stringify(manifest()), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname === "/sw.js") return new Response(serviceWorker(), { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store", "service-worker-allowed": "/" } });
    if (url.pathname === "/app-icon-192.jpg") return proxyLogo(192);
    if (url.pathname === "/app-icon-512.jpg") return proxyLogo(512);
    return ui.fetch(request, env, ctx);
  }
};