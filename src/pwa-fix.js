import app from "./icon-wrapper.js";

const MANIFEST = {
  id: "/",
  name: "Unit 369",
  short_name: "Unit 369",
  description: "Unit 369 AI tim i upravljanje proizvodima.",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#05070c",
  theme_color: "#05070c",
  prefer_related_applications: false,
  icons: [
    { src: "/unit369-192.png?v=3700", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/unit369-512.png?v=3700", sizes: "512x512", type: "image/png", purpose: "any" }
  ]
};

const SW = `
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
`;

function manifestResponse() {
  return new Response(JSON.stringify(MANIFEST), {
    status: 200,
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}

function serviceWorkerResponse() {
  return new Response(SW, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "service-worker-allowed": "/"
    }
  });
}

async function assetIconResponse(request, env, path) {
  if (!env.ASSETS) return new Response("ASSETS binding missing", { status: 500 });
  const u = new URL(request.url);
  u.pathname = path;
  u.search = "";
  const source = await env.ASSETS.fetch(new Request(u.toString(), request));
  if (!source.ok) return source;
  const headers = new Headers(source.headers);
  headers.set("content-type", "image/png");
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(source.body, { status: 200, headers });
}

function patchHtml(html) {
  html = html.replace(/<link[^>]+rel=["']manifest["'][^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name=["']theme-color["'][^>]*>/gi, "");
  html = html.replace(/<link[^>]+rel=["']icon["'][^>]*>/gi, "");
  html = html.replace(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/gi, "");

  const head = `
<link rel="manifest" href="/manifest.webmanifest?v=3700">
<meta name="theme-color" content="#05070c">
<meta name="application-name" content="Unit 369">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="icon" type="image/png" sizes="192x192" href="/unit369-192.png?v=3700">
<link rel="apple-touch-icon" sizes="192x192" href="/unit369-192.png?v=3700">
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=3700', { scope: '/' }).catch(console.error);
  });
}
</script>`;
  return html.replace("</head>", head + "\n</head>");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/manifest.webmanifest" || url.pathname === "/manifest.json") return manifestResponse();
    if (url.pathname === "/sw.js") return serviceWorkerResponse();
    if (url.pathname === "/unit369-192.png") return assetIconResponse(request, env, "/unit369-192.png");
    if (url.pathname === "/unit369-512.png") return assetIconResponse(request, env, "/unit369-512.png");

    const response = await app.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/app") && type.includes("text/html")) {
      const html = patchHtml(await response.text());
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.set("cache-control", "no-store, no-cache, must-revalidate");
      return new Response(html, { status: response.status, statusText: response.statusText, headers });
    }

    return response;
  }
};
