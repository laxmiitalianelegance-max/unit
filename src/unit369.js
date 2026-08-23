import core from "./unit369-core.js";
import { handleOrchestrator } from "./orchestrator.js";
import { handleAuth } from "./accounts.js";
import { decorateAccountUi } from "./account-ui.js";
import { handleNativeCapabilities } from "./native-capabilities.js";
import { NativeStore } from "./native-store.js";
import { ToolStore } from "./tool-store.js";
import { handleProductApi } from "./product-api.js";
import {
  errorResponse,
  requireSameOrigin,
  secureResponse,
} from "./runtime-utils.js";

export { ToolStore, NativeStore };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      requireSameOrigin(request);
      let response = null;
      if (
        url.pathname === "/account" ||
        url.pathname.startsWith("/api/auth/")
      ) {
        response = await handleAuth(request, env, ctx);
      } else if (
        url.pathname === "/api/products" ||
        url.pathname === "/api/create-product"
      ) {
        response = await handleProductApi(request, env, ctx);
      } else if (url.pathname.startsWith("/api/native/")) {
        response = await handleNativeCapabilities(request, env, ctx);
      } else if (url.pathname.startsWith("/api/orchestrator/")) {
        response = await handleOrchestrator(request, env, ctx);
      }
      if (!response) response = await core.fetch(request, env, ctx);
      if (
        request.method === "GET" &&
        (url.pathname === "/" || url.pathname === "/app")
      ) {
        response = await decorateAccountUi(response);
      }
      return await secureResponse(response);
    } catch (error) {
      return await secureResponse(
        errorResponse(error, { path: url.pathname, method: request.method }),
      );
    }
  },
};
