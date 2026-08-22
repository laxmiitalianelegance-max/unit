import app from "./unit369.js";

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
  }
};