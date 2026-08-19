import worker from "./worker.js";

const UNIT_ICON_B64 = "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";

function iconBytes() {
  const binary = atob(UNIT_ICON_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/debug-key") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method === "GET" && url.pathname === "/unit-icon.webp") {
      return new Response(iconBytes(), {
        headers: { "content-type": "image/webp", "cache-control": "public, max-age=3600" }
      });
    }

    if (request.method === "GET" && url.pathname === "/manifest.json") {
      return Response.json({
        name: "UNIT",
        short_name: "UNIT",
        start_url: "/",
        display: "standalone",
        background_color: "#17130f",
        theme_color: "#17130f",
        icons: [
          { src: "/unit-icon.webp", sizes: "512x512", type: "image/webp", purpose: "any maskable" }
        ]
      }, { headers: { "cache-control": "no-cache" } });
    }

    const response = await worker.fetch(request, env, ctx);

    if (request.method === "GET" && url.pathname === "/") {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = await response.text();
        const cleaned = html
          .replace('<p class="eyebrow">Laxmi &middot; Italian Elegance</p>', "")
          .replace("</head>", '<link rel="icon" type="image/webp" href="/unit-icon.webp"><link rel="apple-touch-icon" href="/unit-icon.webp"></head>');
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(cleaned, { status: response.status, statusText: response.statusText, headers });
      }
    }

    return response;
  }
};
