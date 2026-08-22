import APP_HTML from "./app.html";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Nepoznata API ruta." }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }
    return new Response(APP_HTML, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
    });
  }
};
