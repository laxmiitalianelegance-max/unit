import { consumeApproval, requestApproval } from "./state-services.js";
import {
  HttpError,
  errorResponse,
  json,
  readJsonLimited,
  readResponseJsonLimited,
} from "./runtime-utils.js";

async function callNative(request, env, path, body) {
  if (!env.SELF)
    throw new HttpError(
      503,
      "SELF service binding is not configured.",
      "self_binding_missing",
    );
  const origin = new URL(request.url).origin;
  const response = await env.SELF.fetch(
    new Request(origin + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") || "",
        origin,
      },
      body: JSON.stringify(body || {}),
    }),
  );
  const data = await readResponseJsonLimited(response, 512 * 1024);
  if (!response.ok) {
    throw new HttpError(
      response.status,
      data.error || `Native capability failed with HTTP ${response.status}.`,
      data.code || "native_capability_error",
    );
  }
  return data;
}

function payload(step, message, index) {
  const title = `Unit369 ${step.capability} ${index + 1}`;
  switch (step.operation) {
    case "document.create":
      return {
        path: "/api/native/documents",
        body: { title, content: message, tags: ["unit369", "orchestrated"] },
      };
    case "design.create":
      return {
        path: "/api/native/create/designs",
        body: {
          name: title,
          width: 1200,
          height: 630,
          elements: [
            {
              type: "text",
              x: 80,
              y: 120,
              text: message.slice(0, 160),
              size: 42,
            },
          ],
        },
      };
    case "presentation.create":
      return {
        path: "/api/native/create/presentations",
        body: { name: title, slides: [{ title, message }] },
      };
    case "workspace.create":
      return {
        path: "/api/native/build/workspaces",
        body: { name: title, description: message },
      };
    case "project.create":
      return {
        path: "/api/native/projects",
        body: { name: title, description: message },
      };
    case "workflow.create":
      return {
        path: "/api/native/automations",
        body: {
          name: title,
          trigger: { type: "manual" },
          actions: [{ type: "log", message }],
        },
      };
    case "contact.create":
      return {
        path: "/api/native/business/contacts",
        body: { name: title, notes: message },
      };
    case "product.create":
      return {
        path: "/api/native/business/products",
        body: { name: title, description: message, price: 0, stock: 0 },
      };
    case "order.create":
      return {
        path: "/api/native/business/orders",
        body: { name: title, notes: message, total: 0, status: "draft" },
      };
    case "thread.create":
      return {
        path: "/api/native/communicate/threads",
        body: { name: title, subject: message },
      };
    case "notification.create":
      return {
        path: "/api/native/communicate/notifications",
        body: { name: title, message },
      };
    default:
      return null;
  }
}

function actionPlan(message, planner) {
  const plan = planner(message);
  const actions = plan.steps.map((step, index) => ({
    step,
    spec: payload(step, message, index),
  }));
  return { plan, actions, mutates: actions.some((entry) => entry.spec) };
}

async function executeApproved(request, env, message, planData) {
  const runId = `run_${crypto.randomUUID().replace(/-/g, "")}`;
  const started = Date.now();
  const results = [];
  for (const { step, spec } of planData.actions) {
    if (!spec) {
      results.push({
        step,
        status: "planned",
        reason:
          "Operation requires intelligence or read context before execution.",
      });
      continue;
    }
    try {
      const result = await callNative(request, env, spec.path, spec.body);
      results.push({ step, status: "completed", result });
    } catch (error) {
      results.push({
        step,
        status: "failed",
        error: String(error.message || error),
      });
      break;
    }
  }
  const status = results.some((entry) => entry.status === "failed")
    ? "failed"
    : results.some((entry) => entry.status === "planned")
      ? "partial"
      : "completed";
  return json({
    run_id: runId,
    engine: "unit369-native-execution",
    external_required: false,
    status,
    started_at: started,
    completed_at: Date.now(),
    plan: planData.plan,
    results,
  });
}

export async function handleNativeExecution(request, env, account, planner) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/native\/execute\/?/, "");
  try {
    if (request.method === "POST" && !path) {
      const body = await readJsonLimited(request, 32 * 1024);
      const message = String(body.message || "").trim();
      if (!message)
        throw new HttpError(400, "Message is required.", "message_required");
      if (message.length > 4_000)
        throw new HttpError(
          413,
          "Message exceeds the 4,000 character execution limit.",
          "message_too_large",
        );
      if (typeof planner !== "function") {
        throw new HttpError(
          503,
          "Native intent planner is unavailable.",
          "planner_unavailable",
        );
      }
      const planned = actionPlan(message, planner);
      if (!planned.mutates) {
        return executeApproved(request, env, message, planned);
      }
      const approval = await requestApproval(
        env,
        account.uid,
        "native-execution",
        { message, planned },
      );
      return json(
        {
          approval_required: true,
          message:
            "Review and explicitly confirm this native action before it runs.",
          plan: planned.plan,
          approval,
        },
        202,
      );
    }

    if (request.method === "POST" && path === "confirm") {
      const body = await readJsonLimited(request, 8 * 1024);
      const consumed = await consumeApproval(
        env,
        account.uid,
        "native-execution",
        String(body.approval_id || ""),
        String(body.approval_token || ""),
      );
      const message = String(consumed.action?.message || "").trim();
      const planned = consumed.action?.planned;
      if (
        !message ||
        !planned ||
        !planned.plan ||
        !Array.isArray(planned.actions)
      )
        throw new HttpError(
          409,
          "Approved action is invalid.",
          "invalid_approved_action",
        );
      return executeApproved(request, env, message, planned);
    }

    return json({ error: "Execution route not found." }, 404);
  } catch (error) {
    return errorResponse(error, { path: url.pathname, method: request.method });
  }
}
