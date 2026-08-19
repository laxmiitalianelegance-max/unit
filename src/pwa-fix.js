import app from "./icon-wrapper.js";

const MANIFEST = {
  id: "/unit-369",
  name: "Unit 369",
  short_name: "Unit 369",
  description: "Unit 369 AI tim i upravljanje proizvodima.",
  start_url: "/app",
  scope: "/",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "portrait",
  background_color: "#05070c",
  theme_color: "#05070c",
  prefer_related_applications: false,
  icons: [
    { src: "/unit369-192.jpg?v=3697", sizes: "192x192", type: "image/jpeg", purpose: "any" },
    { src: "/unit369-512.jpg?v=3697", sizes: "512x512", type: "image/jpeg", purpose: "any" },
    { src: "/unit369-512.jpg?v=3697", sizes: "512x512", type: "image/jpeg", purpose: "maskable" }
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
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate"
    }
  });
}

function serviceWorkerResponse() {
  return new Response(SW, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "service-worker-allowed": "/"
    }
  });
}

function patchHtml(html) {
  html = html.replace(/<link[^>]+rel=["']manifest["'][^>]*>/gi, "");
  html = html.replace(/<meta[^>]+name=["']theme-color["'][^>]*>/gi, "");
  const head = `
<link rel="manifest" href="/manifest.webmanifest?v=3697">
<meta name="theme-color" content="#05070c">
<meta name="application-name" content="Unit 369">
<meta name="mobile-web-app-capable" content="yes">
<link rel="icon" href="/unit369-192.jpg?v=3697">
<link rel="apple-touch-icon" href="/unit369-192.jpg?v=3697">
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=3697', { scope: '/' }).catch(console.error);
  });
}
</script>`;
  return html.replace("</head>", head + "\n</head>");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/manifest.webmanifest" || url.pathname === "/manifest.json") {
      return manifestResponse();
    }
    if (url.pathname === "/sw.js") {
      return serviceWorkerResponse();
    }

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
