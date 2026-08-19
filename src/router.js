import worker from "./worker.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Disable the old diagnostics endpoint so API-key metadata is never exposed.
    if (url.pathname === "/api/debug-key") {
      return new Response("Not found", { status: 404 });
    }

    const response = await worker.fetch(request, env, ctx);

    // UNIT is a standalone project: remove the legacy LAXMI branding from the app shell only.
    if (request.method === "GET" && url.pathname === "/") {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = await response.text();
        const cleaned = html.replace('<p class="eyebrow">Laxmi &middot; Italian Elegance</p>', "");
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        return new Response(cleaned, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      }
    }

    return response;
  }
};
