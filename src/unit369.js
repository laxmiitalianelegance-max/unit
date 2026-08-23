import core from "./unit369-core.js";
import { handleOrchestrator, ToolStore } from "./orchestrator.js";
import { handleAuth } from "./accounts.js";
import { decorateAccountUi } from "./account-ui.js";
import { handleNativeCapabilities } from "./native-capabilities.js";

export { ToolStore };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/account" || url.pathname.startsWith("/api/auth/")) {
      const response = await handleAuth(request, env, ctx);
      if (response) return response;
    }
    if (url.pathname.startsWith("/api/native/")) {
      const response = await handleNativeCapabilities(request, env, ctx);
      if (response) return response;
    }
    if (url.pathname.startsWith("/api/orchestrator/")) {
      const response = await handleOrchestrator(request, env, ctx);
      if (response) return response;
    }
    const response = await core.fetch(request, env, ctx);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/app")) return decorateAccountUi(response);
    return response;
  }
};