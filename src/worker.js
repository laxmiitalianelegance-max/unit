import APP_HTML from "./app.html";

async function getShopifyAccessToken(env) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET, grant_type: "client_credentials" })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Ne mogu da dobijem Shopify access token: " + JSON.stringify(data));
  return data.access_token;
}

async function shopifyGraphQL(env, accessToken, query, variables) {
  const res = await fetch(`https://${env.SHOPIFY_SHOP}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error("GraphQL greska: " + JSON.stringify(data.errors));
  return data.data;
}

async function createStagedUploadAndSend(env, accessToken, videoBlob, finalName) {
  const mimeType = videoBlob.type || "video/mp4";
  const stagedData = await shopifyGraphQL(env, accessToken, `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`, {
      input: [{ filename: finalName, mimeType, resource: "VIDEO", httpMethod: "POST", fileSize: String(videoBlob.size) }]
    });
  const stagedErrors = stagedData?.stagedUploadsCreate?.userErrors || [];
  if (stagedErrors.length) throw new Error("stagedUploadsCreate: " + JSON.stringify(stagedErrors));
  const target = stagedData?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target) throw new Error("Shopify nije vratio staged upload target.");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", videoBlob, finalName);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error("Shopify upload nije uspeo: " + upload.status);
  return target;
}

async function handleCreateProduct(request, env) {
  try {
    if (!env.SHOPIFY_SHOP || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
      return Response.json({ ok: false, error: "Shopify promenljive nisu podesene na ovom Workeru." }, { status: 500 });
    }
    const form = await request.formData();
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const priceRaw = String(form.get("price") || "").trim().replace(",", ".");
    const price = Number(priceRaw);
    const sizes = String(form.get("sizes") || "").split(",").map(s => s.trim()).filter(Boolean);
    const videoFile = form.get("video");
    if (!title) return Response.json({ ok: false, error: "Nedostaje naziv proizvoda." }, { status: 400 });
    if (!price || Number.isNaN(price) || price <= 0) return Response.json({ ok: false, error: "Cena mora biti broj veci od 0." }, { status: 400 });
    if (!sizes.length) return Response.json({ ok: false, error: "Unesi bar jednu velicinu." }, { status: 400 });
    if (!videoFile || typeof videoFile === "string") return Response.json({ ok: false, error: "Nedostaje video fajl." }, { status: 400 });

    const accessToken = await getShopifyAccessToken(env);
    const productData = await shopifyGraphQL(env, accessToken, `
      mutation productCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id variants(first: 50) { nodes { id } } }
          userErrors { field message }
        }
      }`, {
        product: {
          title,
          descriptionHtml: description ? `<p>${description.replace(/</g, "&lt;")}</p>` : "",
          status: "ACTIVE",
          productOptions: [{ name: "Velicina", values: sizes.map(v => ({ name: v })) }]
        }
      });
    const productErrors = productData?.productCreate?.userErrors || [];
    if (productErrors.length) throw new Error("productCreate: " + JSON.stringify(productErrors));
    const product = productData?.productCreate?.product;
    if (!product) throw new Error("Shopify nije vratio kreiran proizvod.");

    const variantIds = (product.variants?.nodes || []).map(v => v.id);
    if (variantIds.length) {
      const bulkData = await shopifyGraphQL(env, accessToken, `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
        }`, { productId: product.id, variants: variantIds.map(id => ({ id, price: price.toFixed(2) })) });
      const bulkErrors = bulkData?.productVariantsBulkUpdate?.userErrors || [];
      if (bulkErrors.length) throw new Error("productVariantsBulkUpdate: " + JSON.stringify(bulkErrors));
    }

    const finalName = (videoFile.name || "video.mp4").replace(/[^a-zA-Z0-9._-]/g, "_");
    const target = await createStagedUploadAndSend(env, accessToken, videoFile, finalName);
    const mediaData = await shopifyGraphQL(env, accessToken, `
      mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { alt mediaContentType }
          mediaUserErrors { field message }
        }
      }`, { productId: product.id, media: [{ originalSource: target.resourceUrl, mediaContentType: "VIDEO", alt: title }] });
    const mediaErrors = mediaData?.productCreateMedia?.mediaUserErrors || [];
    if (mediaErrors.length) throw new Error("productCreateMedia: " + JSON.stringify(mediaErrors));

    const shopHandle = String(env.SHOPIFY_SHOP || "").split(".")[0];
    const numericId = String(product.id).split("/").pop();
    return Response.json({ ok: true, productId: product.id, adminUrl: shopHandle ? `https://admin.shopify.com/store/${shopHandle}/products/${numericId}` : null });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function handleFreeAi(request, env) {
  try {
    if (!env.AI) return json({ error: "Workers AI binding nije podesen na ovom Workeru." }, 500);
    const incoming = await request.json();
    const userSystem = incoming.messages?.find(m => m.role === "system")?.content;
    const langInstruction = "IMPORTANT: Always reply in the exact same language the user's message is written in. Match their language precisely, including regional variants. Never switch to a different language than the one used in the user's message.";
    const system = userSystem ? `${langInstruction}\n\n${userSystem}` : langInstruction;
    const userMessages = (incoming.messages || []).filter(m => m.role !== "system");
    const result = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", { messages: [{ role: "system", content: system }, ...userMessages], max_tokens: 1000 });
    return json({ choices: [{ message: { content: String(result?.response || "").trim() || "(prazan odgovor)" } }] });
  } catch (error) {
    return json({ error: String(error.message || error) }, 500);
  }
}

async function handleAiProxy(request, env) {
  try {
    const provider = (request.headers.get("x-provider") || "openai").toLowerCase();
    if (provider === "claude") {
      if (!env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY nije podesen na ovom Workeru." }, 500);
      const incoming = await request.json();
      const system = incoming.messages?.find(m => m.role === "system")?.content;
      const userMessages = (incoming.messages || []).filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": String(env.ANTHROPIC_API_KEY).trim(), "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, system, messages: userMessages })
      });
      const data = await upstream.json();
      if (!upstream.ok) return json({ error: data }, upstream.status);
      const block = (data.content || []).find(b => b.type === "text");
      return json({ choices: [{ message: { content: block?.text || "" } }] });
    }
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) return json({ error: "Nedostaje x-api-key header" }, 400);
    const endpoints = { openai: "https://api.openai.com/v1/chat/completions", grok: "https://api.x.ai/v1/chat/completions" };
    const targetUrl = endpoints[provider];
    if (!targetUrl) return json({ error: "Nepoznat provider: " + provider }, 400);
    const upstream = await fetch(targetUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: await request.text() });
    return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch (error) {
    return json({ error: String(error.message || error) }, 500);
  }
}

function renderManifest() {
  return JSON.stringify({ name: "Unit", short_name: "Unit", start_url: "/", display: "standalone", background_color: "#17130f", theme_color: "#17130f" });
}

function renderServiceWorker() {
  return `const CACHE="unit-v1";self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",()=>self.clients.claim());self.addEventListener("fetch",e=>{e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)))})`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/manifest.json") return new Response(renderManifest(), { headers: { "content-type": "application/manifest+json" } });
    if (url.pathname === "/sw.js") return new Response(renderServiceWorker(), { headers: { "content-type": "application/javascript" } });
    if (url.pathname === "/api/create-product" && request.method === "POST") return handleCreateProduct(request, env);
    if (url.pathname === "/api/debug-key") {
      const k = String(env.ANTHROPIC_API_KEY || "");
      return Response.json({ postoji: !!env.ANTHROPIC_API_KEY, duzina: k.length, pocetak: k.slice(0, 8), kraj: k.slice(-4) });
    }
    if (url.pathname === "/api/free-ai" && request.method === "POST") return handleFreeAi(request, env);
    if (url.pathname === "/api/ai-proxy" && request.method === "POST") return handleAiProxy(request, env);
    if (url.pathname === "/api/ai-proxy" && request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-provider" } });
    return new Response(APP_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};
