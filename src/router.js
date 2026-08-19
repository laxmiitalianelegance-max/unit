import worker from "./worker.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Disable the old diagnostics endpoint so API-key metadata is never exposed.
    if (url.pathname === "/api/debug-key") {
      return new Response("Not found", { status: 404 });
    }

    return worker.fetch(request, env, ctx);
  }
};
