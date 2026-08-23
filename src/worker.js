import APP_HTML from "./app.html";

const HTML_PATHS = new Set(["/", "/app", "/index.html"]);

function html() {
  return new Response(APP_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache"
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const acceptsHtml = (request.headers.get("accept") || "").includes("text/html");

    if (method === "GET" && (HTML_PATHS.has(url.pathname) || (acceptsHtml && !url.pathname.includes(".")))) {
      return html();
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        }
      });
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
