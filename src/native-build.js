import { readJsonLimited, readResponseJsonLimited } from "./runtime-utils.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
function clean(v, max = 240) {
  return String(v || "")
    .trim()
    .slice(0, max);
}
function validId(v) {
  return /^[A-Za-z0-9._:-]{1,160}$/.test(String(v || ""));
}
function store(env, uid) {
  if (!env.NATIVE_STORE)
    throw new Error("NATIVE_STORE binding is not configured.");
  return env.NATIVE_STORE.get(env.NATIVE_STORE.idFromName(uid));
}
async function callStore(env, uid, path, init = {}) {
  const r = await store(env, uid).fetch(
    new Request("https://native.internal/native-store" + path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.headers || {}) },
    }),
  );
  const data = await readResponseJsonLimited(r, 8 * 1024 * 1024);
  return { r, data };
}
const COLLECTION = "__unit369_build_v1";
async function ensureCollection(env, uid) {
  const list = await callStore(env, uid, "/data/collections?limit=200");
  if (!list.r.ok)
    throw new Error(
      list.data.error || "Unable to list native data collections.",
    );
  let c = (list.data.collections || []).find((x) => x.name === COLLECTION);
  if (c) return c;
  const created = await callStore(env, uid, "/data/collections", {
    method: "POST",
    body: JSON.stringify({
      name: COLLECTION,
      schema: {
        type: "workspace|snapshot",
        project_id: "string",
        language: "string",
        snapshot: "object",
      },
    }),
  });
  if (!created.r.ok)
    throw new Error(created.data.error || "Unable to create build collection.");
  return created.data.collection;
}
async function records(env, uid, cid) {
  const x = await callStore(
    env,
    uid,
    `/data/collections/${cid}/records?limit=200`,
  );
  if (!x.r.ok) throw new Error(x.data.error || "Unable to read build records.");
  return x.data.records || [];
}
async function getRecord(env, uid, cid, rid) {
  const x = await callStore(
    env,
    uid,
    `/data/collections/${cid}/records/${rid}`,
  );
  return x.r.ok ? x.data.record : null;
}
function ws(r) {
  const d = r.data || {};
  return {
    id: r.id,
    name: r.name || d.name || "",
    project_id: d.project_id || "",
    language: d.language || "mixed",
    description: d.description || "",
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
async function workspaceFiles(env, uid, wid) {
  const x = await callStore(
    env,
    uid,
    `/files?parent_id=${encodeURIComponent(wid)}`,
  );
  if (!x.r.ok)
    throw new Error(x.data.error || "Unable to list workspace files.");
  return x.data.files || [];
}
async function readFiles(env, uid, wid) {
  const list = await workspaceFiles(env, uid, wid),
    out = [];
  for (const f of list) {
    const x = await callStore(env, uid, `/files/${f.id}`);
    if (x.r.ok)
      out.push({
        id: f.id,
        path: f.name,
        content: x.data.file.body || "",
        mime: x.data.file.mime || "text/plain",
        updated_at: f.updated_at,
      });
  }
  return out;
}
function lineDiff(a, b) {
  const A = String(a || "").split("\n"),
    B = String(b || "").split("\n"),
    n = Math.max(A.length, B.length),
    changes = [];
  for (let i = 0; i < n; i++)
    if (A[i] !== B[i])
      changes.push({ line: i + 1, before: A[i] ?? null, after: B[i] ?? null });
  return changes.slice(0, 2000);
}
export async function handleNativeBuild(request, env, account) {
  const u = new URL(request.url),
    p = u.pathname
      .replace(/^\/api\/native\/build\/?/, "")
      .split("/")
      .filter(Boolean),
    cid = (await ensureCollection(env, account.uid)).id;
  if (!p.length) {
    if (request.method === "GET") {
      const all = await records(env, account.uid, cid);
      return json({
        workspaces: all.filter((r) => r.data?.type === "workspace").map(ws),
      });
    }
    if (request.method === "POST") {
      const b = await readJsonLimited(request, 1024 * 1024),
        name = clean(b.name);
      if (!name) return json({ error: "Workspace name is required." }, 400);
      const d = {
        type: "workspace",
        name,
        project_id: clean(b.project_id, 160),
        language: clean(b.language || "mixed", 80),
        description: clean(b.description, 4000),
      };
      const x = await callStore(
        env,
        account.uid,
        `/data/collections/${cid}/records`,
        { method: "POST", body: JSON.stringify({ name, record: d }) },
      );
      if (!x.r.ok) return json(x.data, x.r.status);
      return json({ workspace: ws(x.data.record) }, 201);
    }
    return json({ error: "Method not allowed." }, 405);
  }
  const wid = p[0];
  if (!validId(wid)) return json({ error: "Invalid workspace id." }, 400);
  const rec = await getRecord(env, account.uid, cid, wid);
  if (!rec || rec.data?.type !== "workspace")
    return json({ error: "Workspace not found." }, 404);
  if (p.length === 1) {
    if (request.method === "GET") return json({ workspace: ws(rec) });
    if (request.method === "PUT") {
      const b = await readJsonLimited(request, 1024 * 1024),
        old = rec.data || {},
        name = clean(b.name || rec.name),
        d = {
          ...old,
          type: "workspace",
          name,
          project_id:
            b.project_id === undefined
              ? old.project_id || ""
              : clean(b.project_id, 160),
          language: clean(b.language || old.language || "mixed", 80),
          description:
            b.description === undefined
              ? old.description || ""
              : clean(b.description, 4000),
        };
      const x = await callStore(
        env,
        account.uid,
        `/data/collections/${cid}/records/${wid}`,
        { method: "PUT", body: JSON.stringify({ name, record: d }) },
      );
      if (!x.r.ok) return json(x.data, x.r.status);
      return json({
        workspace: {
          id: wid,
          name,
          project_id: d.project_id,
          language: d.language,
          description: d.description,
          updated_at: Date.now(),
        },
      });
    }
    if (request.method === "DELETE") {
      for (const f of await workspaceFiles(env, account.uid, wid))
        await callStore(env, account.uid, `/files/${f.id}`, {
          method: "DELETE",
        });
      for (const r of (await records(env, account.uid, cid)).filter(
        (x) => x.data?.type === "snapshot" && x.data?.workspace_id === wid,
      ))
        await callStore(
          env,
          account.uid,
          `/data/collections/${cid}/records/${r.id}`,
          { method: "DELETE" },
        );
      const x = await callStore(
        env,
        account.uid,
        `/data/collections/${cid}/records/${wid}`,
        { method: "DELETE" },
      );
      if (!x.r.ok) return json(x.data, x.r.status);
      return json({ ok: true });
    }
    return json({ error: "Method not allowed." }, 405);
  }
  if (p[1] === "files") {
    if (p.length === 2) {
      if (request.method === "GET")
        return json({ files: await workspaceFiles(env, account.uid, wid) });
      if (request.method === "POST") {
        const b = await readJsonLimited(request, 1024 * 1024),
          path = clean(b.path || b.name, 500);
        if (!path) return json({ error: "File path is required." }, 400);
        const x = await callStore(env, account.uid, "/files", {
          method: "POST",
          body: JSON.stringify({
            name: path,
            parent_id: wid,
            content: String(b.content ?? ""),
            mime: clean(b.mime || "text/plain", 100),
            meta: { workspace_id: wid, kind: "source" },
          }),
        });
        if (!x.r.ok) return json(x.data, x.r.status);
        return json({ file: { ...x.data.file, path } }, 201);
      }
      return json({ error: "Method not allowed." }, 405);
    }
    const fid = p[2];
    if (!validId(fid)) return json({ error: "Invalid file id." }, 400);
    const x = await callStore(env, account.uid, `/files/${fid}`);
    if (!x.r.ok || x.data.file?.parent_id !== wid)
      return json({ error: "File not found." }, 404);
    if (request.method === "GET")
      return json({ file: { ...x.data.file, path: x.data.file.name } });
    if (request.method === "PUT") {
      const b = await readJsonLimited(request, 1024 * 1024),
        up = await callStore(env, account.uid, `/files/${fid}`, {
          method: "PUT",
          body: JSON.stringify({
            name: clean(b.path || b.name || x.data.file.name, 500),
            parent_id: wid,
            content:
              b.content === undefined ? x.data.file.body : String(b.content),
            mime: clean(b.mime || x.data.file.mime || "text/plain", 100),
            meta: {
              ...(x.data.file.meta || {}),
              workspace_id: wid,
              kind: "source",
            },
          }),
        });
      if (!up.r.ok) return json(up.data, up.r.status);
      return json({ ok: true, id: fid, updated_at: up.data.updated_at });
    }
    if (request.method === "DELETE") {
      const del = await callStore(env, account.uid, `/files/${fid}`, {
        method: "DELETE",
      });
      return json(del.data, del.r.status);
    }
    return json({ error: "Method not allowed." }, 405);
  }
  if (p[1] === "tree" && request.method === "GET") {
    const files = await workspaceFiles(env, account.uid, wid);
    return json({
      workspace_id: wid,
      tree: files
        .map((f) => ({
          id: f.id,
          path: f.name,
          mime: f.mime,
          size: f.size,
          updated_at: f.updated_at,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    });
  }
  if (p[1] === "snapshots") {
    if (p.length === 2 && request.method === "POST") {
      const b = await readJsonLimited(request, 1024 * 1024),
        files = await readFiles(env, account.uid, wid),
        name = clean(b.name || `snapshot-${Date.now()}`),
        d = {
          type: "snapshot",
          workspace_id: wid,
          message: clean(b.message, 1000),
          files,
        };
      const x = await callStore(
        env,
        account.uid,
        `/data/collections/${cid}/records`,
        { method: "POST", body: JSON.stringify({ name, record: d }) },
      );
      if (!x.r.ok) return json(x.data, x.r.status);
      return json(
        {
          snapshot: {
            id: x.data.record.id,
            name,
            workspace_id: wid,
            file_count: files.length,
            created_at: x.data.record.created_at,
          },
        },
        201,
      );
    }
    if (p.length === 2 && request.method === "GET") {
      const all = await records(env, account.uid, cid);
      return json({
        snapshots: all
          .filter(
            (r) => r.data?.type === "snapshot" && r.data?.workspace_id === wid,
          )
          .map((r) => ({
            id: r.id,
            name: r.name,
            message: r.data?.message || "",
            file_count: (r.data?.files || []).length,
            created_at: r.created_at,
          })),
      });
    }
    return json({ error: "Method not allowed." }, 405);
  }
  if (p[1] === "diff" && request.method === "GET") {
    const sid = clean(u.searchParams.get("snapshot"), 160);
    if (!validId(sid))
      return json({ error: "snapshot query parameter is required." }, 400);
    const snap = await getRecord(env, account.uid, cid, sid);
    if (
      !snap ||
      snap.data?.type !== "snapshot" ||
      snap.data?.workspace_id !== wid
    )
      return json({ error: "Snapshot not found." }, 404);
    const before = new Map((snap.data.files || []).map((f) => [f.path, f])),
      current = await readFiles(env, account.uid, wid),
      after = new Map(current.map((f) => [f.path, f])),
      paths = [...new Set([...before.keys(), ...after.keys()])].sort(),
      files = [];
    for (const path of paths) {
      const a = before.get(path),
        b = after.get(path);
      if (!a)
        files.push({ path, status: "added", changes: lineDiff("", b.content) });
      else if (!b)
        files.push({
          path,
          status: "deleted",
          changes: lineDiff(a.content, ""),
        });
      else {
        const changes = lineDiff(a.content, b.content);
        if (changes.length) files.push({ path, status: "modified", changes });
      }
    }
    return json({ workspace_id: wid, snapshot_id: sid, files });
  }
  if (p[1] === "test-plan" && request.method === "POST") {
    const b = await readJsonLimited(request, 1024 * 1024),
      files = await workspaceFiles(env, account.uid, wid);
    return json({
      workspace_id: wid,
      mode: "plan-only",
      command: clean(b.command || "", 300),
      files: files.map((f) => f.name),
      steps: [
        "Inspect project structure",
        "Validate syntax and configuration",
        "Submit code to the isolated execution plan endpoint",
        "Require explicit owner approval before execution",
        "Capture logs and artifacts",
      ],
      execution_available: !!env.UNIT369_SANDBOX,
      execution_endpoint: "/api/native/code/plan",
    });
  }
  return json({ error: "Build route not found." }, 404);
}
