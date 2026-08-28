import { resolveAccount } from "./accounts.js";
import { handleNativeWork } from "./native-work.js";
import { handleNativeBuild } from "./native-build.js";
import { handleNativeAutomation } from "./native-automation.js";
import { handleNativeBusiness } from "./native-business.js";
import { handleNativeCommunicate } from "./native-communicate.js";
import { handleNativeCreate } from "./native-create.js";
import { handleNativeExecution } from "./native-execution.js";
import {
  codeExecutionCapabilities,
  handleNativeCodeExecution,
} from "./native-code-execution.js";
import { handleNativeFiles } from "./native-files.js";
import { dataLabCapabilities, handleNativeDataLab } from "./native-data-lab.js";
import {
  handleNativeKnowledge,
  knowledgeCapabilities,
} from "./native-knowledge.js";
import { HttpError, errorResponse, readJsonLimited } from "./runtime-utils.js";

export const NATIVE_CAPABILITIES = Object.freeze({
  intelligence: {
    name: "Intelligence",
    version: 2,
    operations: [
      "chat",
      "research",
      "plan",
      "critique",
      "verify",
      "knowledge.import",
      "knowledge.search",
    ],
    native: true,
  },
  create: {
    name: "Create",
    version: 2,
    operations: [
      "document.create",
      "document.read",
      "document.list",
      "document.update",
      "document.delete",
      "design.create",
      "design.read",
      "design.list",
      "design.update",
      "design.delete",
      "design.render",
      "presentation.create",
      "presentation.read",
      "presentation.list",
      "presentation.update",
      "presentation.delete",
    ],
    native: true,
  },
  build: {
    name: "Build",
    version: 4,
    operations: [
      "workspace.create",
      "workspace.read",
      "workspace.list",
      "workspace.update",
      "workspace.delete",
      "file.create",
      "file.read",
      "file.list",
      "file.update",
      "file.delete",
      "tree.read",
      "snapshot.create",
      "snapshot.list",
      "diff.read",
      "test.plan",
      "project.import",
      "project.execution.capabilities",
      "project.execution.plan",
      "project.execution.confirm",
      "project.execution.cancel",
    ],
    native: true,
  },
  code: {
    name: "Isolated Code Execution",
    version: 1,
    operations: [
      "code.capabilities",
      "code.plan",
      "code.confirm",
      "code.cancel",
    ],
    native: true,
  },
  work: {
    name: "Work",
    version: 2,
    operations: [
      "project.create",
      "project.read",
      "project.list",
      "project.update",
      "project.delete",
      "task.create",
      "task.read",
      "task.list",
      "task.update",
      "task.delete",
      "milestone.manage",
    ],
    native: true,
  },
  data: {
    name: "Data",
    version: 2,
    operations: [
      "collection.create",
      "record.create",
      "record.update",
      "record.query",
      "search",
      "data-lab.import",
      "data-lab.profile",
      "data-lab.clean",
      "data-lab.chart",
      "data-lab.predict",
      "data-lab.confirm",
      "data-lab.cancel",
    ],
    native: true,
  },
  automate: {
    name: "Automate",
    version: 2,
    operations: [
      "workflow.create",
      "workflow.read",
      "workflow.list",
      "workflow.update",
      "workflow.delete",
      "workflow.run",
      "schedule.define",
      "condition.evaluate",
      "approval.request",
      "approval.execute",
      "execution.list",
    ],
    native: true,
  },
  business: {
    name: "Business",
    version: 2,
    operations: [
      "contact.create",
      "contact.read",
      "contact.list",
      "contact.update",
      "contact.delete",
      "lead.create",
      "lead.update",
      "lead.list",
      "product.create",
      "product.read",
      "product.list",
      "product.update",
      "product.delete",
      "order.create",
      "order.read",
      "order.list",
      "order.update",
      "order.delete",
      "invoice.create",
      "invoice.list",
      "dashboard.read",
    ],
    native: true,
  },
  communicate: {
    name: "Communicate",
    version: 2,
    operations: [
      "thread.create",
      "thread.read",
      "thread.list",
      "thread.update",
      "thread.delete",
      "message.create",
      "message.list",
      "notification.create",
      "notification.list",
      "notification.update",
      "notification.delete",
    ],
    native: true,
  },
  files: {
    name: "Files",
    version: 1,
    operations: [
      "file.store",
      "file.read",
      "file.list",
      "file.delete",
      "file.search",
    ],
    native: true,
  },
  orchestrate: {
    name: "Orchestrate",
    version: 2,
    operations: [
      "intent.plan",
      "capability.execute",
      "result.verify",
      "audit.read",
      "run.execute",
    ],
    native: true,
  },
});

const MAX_DOCUMENT_CHARS = 250000;
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
export function capabilityList(env = {}) {
  return Object.entries(NATIVE_CAPABILITIES).map(([id, c]) => ({
    id,
    ...c,
    ...(id === "code"
      ? { runtime: codeExecutionCapabilities(!!env.UNIT369_SANDBOX) }
      : id === "intelligence"
        ? { knowledge: knowledgeCapabilities() }
        : id === "data"
          ? { data_lab: dataLabCapabilities(!!env.UNIT369_SANDBOX) }
          : {}),
  }));
}
export function hasOperation(capability, operation) {
  const c = NATIVE_CAPABILITIES[capability];
  return !!c && c.operations.includes(operation);
}

export function planNativeIntent(text) {
  const q = String(text || "").toLowerCase(),
    steps = [];
  const add = (capability, operation, reason) => {
    if (
      hasOperation(capability, operation) &&
      !steps.some(
        (s) => s.capability === capability && s.operation === operation,
      )
    )
      steps.push({ capability, operation, reason });
  };
  if (
    /document|doc|note|report|write|tekst|dokument|izveštaj|izvjestaj/.test(q)
  )
    add("create", "document.create", "Create a native Unit369 document");
  if (
    /design|visual|poster|banner|logo|image|graphic|dizajn|vizual|slika|grafik/.test(
      q,
    )
  )
    add("create", "design.create", "Create a native Unit369 visual design");
  if (/presentation|slides|deck|prezentacij|slajd/.test(q))
    add(
      "create",
      "presentation.create",
      "Create a native Unit369 presentation",
    );
  if (
    /knowledge|search|find|remember|znanje|pretraž|pretraz|nađi|nadji/.test(q)
  )
    add("intelligence", "knowledge.search", "Search native Unit369 knowledge");
  if (
    /code|app|website|site|build|program|source|repo|kod|aplikacij|sajt/.test(q)
  )
    add(
      "build",
      "workspace.create",
      "Create or modify a native Unit369 code workspace",
    );
  if (/execute|run|compile|test|izvrš|izvrs|pokren|kompajl|testir/.test(q))
    add("code", "code.plan", "Run code in an isolated Unit369 sandbox");
  if (/project|projekat|projekt/.test(q))
    add("work", "project.create", "Create or manage a native Unit369 project");
  if (/task|milestone|plan|zadat/.test(q))
    add("work", "task.create", "Track work natively in Unit369");
  if (/data|table|database|record|podac|tabel|baza/.test(q))
    add("data", "collection.create", "Use native Unit369 structured data");
  if (
    /automat|workflow|schedule|trigger|condition|approval|raspored|okidač|okidac|uslov|odobren/.test(
      q,
    )
  )
    add(
      "automate",
      "workflow.create",
      "Build and run a native Unit369 workflow",
    );
  if (/customer|contact|crm|lead|kupac|kontakt/.test(q))
    add(
      "business",
      "contact.create",
      "Manage customers and CRM natively in Unit369",
    );
  if (/product|catalog|inventory|proizvod|katalog|lager/.test(q))
    add(
      "business",
      "product.create",
      "Manage products and inventory natively in Unit369",
    );
  if (/order|invoice|quote|business|porud|narud|faktur|ponud/.test(q))
    add("business", "order.create", "Manage commerce natively in Unit369");
  if (/message|thread|comment|conversation|poruk|komentar|razgovor/.test(q))
    add("communicate", "thread.create", "Use native Unit369 communication");
  if (/notify|notification|obavest|obavijest/.test(q))
    add(
      "communicate",
      "notification.create",
      "Create a native Unit369 notification",
    );
  if (/file|folder|upload|storage|fajl|datotek/.test(q))
    add("files", "file.store", "Use native Unit369 file storage");
  if (!steps.length)
    add(
      "intelligence",
      "plan",
      "Use Unit369 intelligence to decompose the request",
    );
  return { engine: "unit369-native", external_required: false, steps };
}

function store(env, uid) {
  if (!env.NATIVE_STORE)
    throw new Error("NATIVE_STORE binding is not configured.");
  return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid));
}

async function payloadLimit(request, kind) {
  if (!["POST", "PUT"].includes(request.method)) return null;
  const declared = Number(request.headers.get("content-length") || 0);
  if (kind === "documents" && declared > MAX_DOCUMENT_CHARS + 65536)
    return json({ error: "Document payload is too large." }, 413);
  let body;
  try {
    body = await readJsonLimited(request.clone(), MAX_DOCUMENT_CHARS + 65_536);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return null;
  }
  if (
    kind === "documents" &&
    body &&
    body.content !== undefined &&
    String(body.content).length > MAX_DOCUMENT_CHARS
  )
    return json(
      { error: "Document content exceeds the 250,000 character limit." },
      413,
    );
  return null;
}

async function proxyNative(request, env, account, url) {
  const match = url.pathname.match(
    /^\/api\/native\/(data|documents|knowledge)(.*)$/,
  );
  if (!match) return json({ error: "Native capability route not found." }, 404);
  const limited = await payloadLimit(request, match[1]);
  if (limited) return limited;
  return store(env, account.uid).fetch(
    new Request(
      "https://native.internal/native-store/" +
        match[1] +
        match[2] +
        url.search,
      request,
    ),
  );
}

export async function handleNativeCapabilities(
  request,
  env,
  _ctx,
  runtime = {},
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/native/")) return null;
  const account = await resolveAccount(request, env);
  if (!account) return json({ error: "Authentication required." }, 401);

  try {
    if (
      url.pathname === "/api/native/capabilities" &&
      request.method === "GET"
    ) {
      return json({ native: true, capabilities: capabilityList(env) });
    }

    if (url.pathname === "/api/native/plan" && request.method === "POST") {
      const body = await readJsonLimited(request, 32 * 1024);
      return json({ user_id: account.uid, ...planNativeIntent(body.message) });
    }

    if (/^\/api\/native\/execute(\/|$)/.test(url.pathname))
      return handleNativeExecution(request, env, account, planNativeIntent);
    if (/^\/api\/native\/code(\/|$)/.test(url.pathname))
      return handleNativeCodeExecution(request, env, account, runtime);
    if (/^\/api\/native\/data-lab(\/|$)/.test(url.pathname))
      return handleNativeDataLab(request, env, account, runtime);
    if (/^\/api\/native\/knowledge(\/|$)/.test(url.pathname))
      return handleNativeKnowledge(request, env, account);
    if (/^\/api\/native\/create(\/|$)/.test(url.pathname))
      return handleNativeCreate(request, env, account);
    if (/^\/api\/native\/communicate(\/|$)/.test(url.pathname))
      return handleNativeCommunicate(request, env, account);
    if (/^\/api\/native\/business(\/|$)/.test(url.pathname))
      return handleNativeBusiness(request, env, account);
    if (/^\/api\/native\/automations(\/|$)/.test(url.pathname))
      return handleNativeAutomation(request, env, account);
    if (/^\/api\/native\/build(\/|$)/.test(url.pathname))
      return handleNativeBuild(request, env, account, runtime);
    if (/^\/api\/native\/projects(\/|$)/.test(url.pathname))
      return handleNativeWork(request, env, account);
    if (/^\/api\/native\/files(\/|$)/.test(url.pathname))
      return handleNativeFiles(request, env, account);
    if (/^\/api\/native\/(data|documents|knowledge)(\/|$)/.test(url.pathname))
      return proxyNative(request, env, account, url);

    return json({ error: "Native capability route not found." }, 404);
  } catch (e) {
    return errorResponse(e, { path: url.pathname, method: request.method });
  }
}
