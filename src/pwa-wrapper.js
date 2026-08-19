import legacy from "./icon-wrapper.js";

const MANIFEST = {
  id: "/",
  name: "Unit 369",
  short_name: "Unit 369",
  start_url: "/",
  scope: "/",
  display: "standalone",
  display_override: ["standalone"],
  background_color: "#05070c",
  theme_color: "#05070c",
  prefer_related_applications: false,
  icons: [
    { src: "/unit369-192.jpg?v=3697", sizes: "192x192", type: "image/jpeg", purpose: "any" },
    { src: "/unit369-512.jpg?v=3697", sizes: "512x512", type: "image/jpeg", purpose: "any" }
  ]
};

const SW = `
self.addEventListener("install", event => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {});
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

function normalizeHtml(html) {
  // Keep the existing Unit 369 UI intact. Only normalize PWA metadata.
  html = html.replace(/<link\b[^>]*\brel=["']manifest["'][^>]*>/gi, "");
  html = html.replace(/<meta\b[^>]*\bname=["'](?:application-name|apple-mobile-web-app-title|mobile-web-app-capable|apple-mobile-web-app-capable|theme-color)["'][^>]*>/gi, "");

  const pwaHead = `
<link rel="manifest" href="/manifest.json?v=3697">
<link rel="icon" href="/unit369-192.jpg?v=3697" sizes="192x192" type="image/jpeg">
<link rel="apple-touch-icon" href="/unit369-192.jpg?v=3697">
<meta name="application-name" content="Unit 369">
<meta name="apple-mobile-web-app-title" content="Unit 369">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#05070c">
<script>
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}
</script>`;

  return html.replace(/<\/head>/i, pwaHead + "\n</head>");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/manifest.json") return manifestResponse();
    if (url.pathname === "/sw.js") return serviceWorkerResponse();

    const response = await legacy.fetch(request, env, ctx);
    const type = response.headers.get("content-type") || "";

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/app") && type.includes("text/html")) {
      const html = normalizeHtml(await response.text());
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.set("cache-control", "no-store, no-cache, must-revalidate");
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    return response;
  }
};
