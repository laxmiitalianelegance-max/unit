function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
function id(prefix = "n") {
  return prefix + "_" + crypto.randomUUID().replace(/-/g, "");
}
function cleanName(v, max = 160) {
  return String(v || "")
    .trim()
    .slice(0, max);
}
function safeKey(v) {
  const s = String(v || "");
  return /^[A-Za-z0-9._:-]{1,160}$/.test(s) ? s : "";
}
function pageParams(url, fallback = 50, maximum = 200) {
  const limit = Math.max(
      1,
      Math.min(maximum, Number(url.searchParams.get("limit")) || fallback),
    ),
    offset = Math.max(
      0,
      Math.min(1_000_000, Number(url.searchParams.get("offset")) || 0),
    );
  return { limit: Math.trunc(limit), offset: Math.trunc(offset) };
}
function pageInfo(limit, offset, count) {
  return {
    limit,
    offset,
    next_offset: count === limit ? offset + count : null,
    has_more: count === limit,
  };
}
function obj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function excerpt(text, query, max = 320) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  const q = String(query || "").toLowerCase();
  const at = q ? s.toLowerCase().indexOf(q) : -1;
  if (at < 0) return s.slice(0, max);
  const start = Math.max(0, at - Math.floor(max / 3));
  return s.slice(start, start + max);
}

import { HttpError, readJsonLimited } from "./runtime-utils.js";

export class NativeStore {
  constructor(state) {
    this.state = state;
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS native_items (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      parent_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      mime TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      meta TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(kind,id)
    );
    CREATE INDEX IF NOT EXISTS idx_native_kind_parent ON native_items(kind,parent_id);
    CREATE INDEX IF NOT EXISTS idx_native_kind_updated ON native_items(kind,updated_at DESC);`);
  }
  rows(cursor) {
    return Array.from(cursor || []);
  }
  get(kind, itemId) {
    return (
      this.rows(
        this.sql.exec(
          "SELECT * FROM native_items WHERE kind=? AND id=? LIMIT 1",
          kind,
          itemId,
        ),
      )[0] || null
    );
  }
  async fetch(request) {
    const u = new URL(request.url),
      p = u.pathname.split("/").filter(Boolean);
    try {
      if (p[0] !== "native-store") return json({ error: "Not found." }, 404);
      if (p[1] === "files") return this.files(request, u, p.slice(2));
      if (p[1] === "data") return this.data(request, u, p.slice(2));
      if (p[1] === "documents") return this.documents(request, u, p.slice(2));
      if (p[1] === "knowledge") return this.knowledge(request, u, p.slice(2));
      return json({ error: "Not found." }, 404);
    } catch (e) {
      if (!(e instanceof HttpError)) {
        console.error({
          event: "native_store_failed",
          path: u.pathname,
          error: String(e.message || e).slice(0, 700),
        });
      }
      return json(
        {
          error:
            e instanceof HttpError
              ? String(e.message || e)
              : "Native store error.",
          code: e.code || "native_store_error",
        },
        e instanceof HttpError ? e.status : 500,
      );
    }
  }
  async files(request, u, p) {
    const now = Date.now();
    if (request.method === "POST" && p.length === 0) {
      const b = await readJsonLimited(request, 8 * 1024 * 1024),
        name = cleanName(b.name);
      if (!name) return json({ error: "File name is required." }, 400);
      const itemId = id("f"),
        body = String(b.content ?? ""),
        mime = cleanName(b.mime || "text/plain", 100),
        parent = safeKey(b.parent_id),
        meta = JSON.stringify(obj(b.meta));
      this.sql.exec(
        "INSERT INTO native_items(kind,id,parent_id,name,mime,body,meta,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        "file",
        itemId,
        parent,
        name,
        mime,
        body,
        meta,
        now,
        now,
      );
      return json(
        {
          file: {
            id: itemId,
            name,
            mime,
            parent_id: parent,
            size: new TextEncoder().encode(body).length,
            created_at: now,
            updated_at: now,
          },
        },
        201,
      );
    }
    if (request.method === "GET" && p.length === 0) {
      const parent = safeKey(u.searchParams.get("parent_id")),
        q = String(u.searchParams.get("q") || "")
          .trim()
          .slice(0, 100),
        { limit, offset } = pageParams(u);
      const rows = q
        ? this.rows(
            this.sql.exec(
              "SELECT id,parent_id,name,mime,length(CAST(body AS BLOB)) size,created_at,updated_at FROM native_items WHERE kind=? AND parent_id=? AND name LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
              "file",
              parent,
              "%" + q + "%",
              limit,
              offset,
            ),
          )
        : this.rows(
            this.sql.exec(
              "SELECT id,parent_id,name,mime,length(CAST(body AS BLOB)) size,created_at,updated_at FROM native_items WHERE kind=? AND parent_id=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
              "file",
              parent,
              limit,
              offset,
            ),
          );
      return json({
        files: rows,
        pagination: pageInfo(limit, offset, rows.length),
      });
    }
    const itemId = safeKey(p[0]);
    if (!itemId) return json({ error: "Invalid file id." }, 400);
    const r = this.get("file", itemId);
    if (!r) return json({ error: "File not found." }, 404);
    if (request.method === "GET")
      return json({ file: { ...r, meta: JSON.parse(r.meta || "{}") } });
    if (request.method === "PUT") {
      const b = await readJsonLimited(request, 8 * 1024 * 1024),
        name = cleanName(b.name || r.name),
        body = b.content === undefined ? r.body : String(b.content),
        mime = cleanName(b.mime || r.mime, 100),
        parent = b.parent_id === undefined ? r.parent_id : safeKey(b.parent_id),
        meta = b.meta === undefined ? r.meta : JSON.stringify(obj(b.meta));
      this.sql.exec(
        "UPDATE native_items SET parent_id=?,name=?,mime=?,body=?,meta=?,updated_at=? WHERE kind=? AND id=?",
        parent,
        name,
        mime,
        body,
        meta,
        now,
        "file",
        itemId,
      );
      return json({ ok: true, id: itemId, updated_at: now });
    }
    if (request.method === "DELETE") {
      this.sql.exec(
        "DELETE FROM native_items WHERE kind=? AND id=?",
        "file",
        itemId,
      );
      return json({ ok: true });
    }
    return json({ error: "Method not allowed." }, 405);
  }
  async data(request, u, p) {
    const now = Date.now();
    if (p[0] === "collections" && p.length === 1 && request.method === "POST") {
      const b = await readJsonLimited(request, 512 * 1024),
        name = cleanName(b.name);
      if (!name) return json({ error: "Collection name is required." }, 400);
      const cid = id("c"),
        schema = JSON.stringify(obj(b.schema));
      this.sql.exec(
        "INSERT INTO native_items(kind,id,name,body,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        "collection",
        cid,
        name,
        schema,
        now,
        now,
      );
      return json(
        {
          collection: {
            id: cid,
            name,
            schema: JSON.parse(schema),
            created_at: now,
          },
        },
        201,
      );
    }
    if (p[0] === "collections" && p.length === 1 && request.method === "GET") {
      const { limit, offset } = pageParams(u);
      const rows = this.rows(
        this.sql.exec(
          "SELECT id,name,body schema,created_at,updated_at FROM native_items WHERE kind=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
          "collection",
          limit,
          offset,
        ),
      ).map((x) => ({ ...x, schema: JSON.parse(x.schema || "{}") }));
      return json({
        collections: rows,
        pagination: pageInfo(limit, offset, rows.length),
      });
    }
    const cid = safeKey(p[1]);
    if (p[0] !== "collections" || !cid)
      return json({ error: "Invalid collection." }, 400);
    const col = this.get("collection", cid);
    if (!col) return json({ error: "Collection not found." }, 404);
    if (p[2] === "records" && p.length === 3 && request.method === "POST") {
      const b = await readJsonLimited(request, 512 * 1024),
        rid = id("r"),
        record = obj(b.record);
      this.sql.exec(
        "INSERT INTO native_items(kind,id,parent_id,name,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        "record",
        rid,
        cid,
        cleanName(b.name || rid),
        JSON.stringify(record),
        now,
        now,
      );
      return json(
        {
          record: {
            id: rid,
            collection_id: cid,
            data: record,
            created_at: now,
          },
        },
        201,
      );
    }
    if (p[2] === "records" && p.length === 3 && request.method === "GET") {
      const q = String(u.searchParams.get("q") || "")
          .trim()
          .slice(0, 100),
        { limit, offset } = pageParams(u),
        rows = q
          ? this.rows(
              this.sql.exec(
                "SELECT id,name,body,created_at,updated_at FROM native_items WHERE kind=? AND parent_id=? AND (name LIKE ? OR body LIKE ?) ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                "record",
                cid,
                "%" + q + "%",
                "%" + q + "%",
                limit,
                offset,
              ),
            )
          : this.rows(
              this.sql.exec(
                "SELECT id,name,body,created_at,updated_at FROM native_items WHERE kind=? AND parent_id=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                "record",
                cid,
                limit,
                offset,
              ),
            );
      return json({
        records: rows.map((x) => ({
          id: x.id,
          name: x.name,
          data: JSON.parse(x.body || "{}"),
          created_at: x.created_at,
          updated_at: x.updated_at,
        })),
        pagination: pageInfo(limit, offset, rows.length),
      });
    }
    const rid = safeKey(p[3]);
    if (p[2] !== "records" || !rid)
      return json({ error: "Invalid record." }, 400);
    const r = this.get("record", rid);
    if (!r || r.parent_id !== cid)
      return json({ error: "Record not found." }, 404);
    if (request.method === "GET")
      return json({
        record: {
          id: r.id,
          name: r.name,
          collection_id: cid,
          data: JSON.parse(r.body || "{}"),
          created_at: r.created_at,
          updated_at: r.updated_at,
        },
      });
    if (request.method === "PUT") {
      const b = await readJsonLimited(request, 512 * 1024),
        record =
          b.record && typeof b.record === "object"
            ? b.record
            : JSON.parse(r.body || "{}");
      this.sql.exec(
        "UPDATE native_items SET name=?,body=?,updated_at=? WHERE kind=? AND id=?",
        cleanName(b.name || r.name),
        JSON.stringify(record),
        now,
        "record",
        rid,
      );
      return json({ ok: true, id: rid, updated_at: now });
    }
    if (request.method === "DELETE") {
      this.sql.exec(
        "DELETE FROM native_items WHERE kind=? AND id=?",
        "record",
        rid,
      );
      return json({ ok: true });
    }
    return json({ error: "Method not allowed." }, 405);
  }
  async documents(request, u, p) {
    const now = Date.now();
    if (p.length === 0 && request.method === "POST") {
      const b = await readJsonLimited(request, 384 * 1024),
        title = cleanName(b.title || b.name);
      if (!title) return json({ error: "Document title is required." }, 400);
      const did = id("d"),
        content = String(b.content ?? ""),
        format = cleanName(b.format || "markdown", 40),
        tags = Array.isArray(b.tags)
          ? b.tags
              .map((x) => cleanName(x, 60))
              .filter(Boolean)
              .slice(0, 32)
          : [],
        meta = { tags, format, version: 1, ...obj(b.meta) };
      this.sql.exec(
        "INSERT INTO native_items(kind,id,name,mime,body,meta,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
        "document",
        did,
        title,
        "text/" + format,
        content,
        JSON.stringify(meta),
        now,
        now,
      );
      return json(
        {
          document: {
            id: did,
            title,
            content,
            format,
            tags,
            version: 1,
            created_at: now,
            updated_at: now,
          },
        },
        201,
      );
    }
    if (p.length === 0 && request.method === "GET") {
      const q = String(u.searchParams.get("q") || "")
          .trim()
          .slice(0, 120),
        { limit, offset } = pageParams(u),
        rows = q
          ? this.rows(
              this.sql.exec(
                "SELECT id,name,mime,meta,created_at,updated_at FROM native_items WHERE kind=? AND (name LIKE ? OR body LIKE ? OR meta LIKE ?) ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                "document",
                "%" + q + "%",
                "%" + q + "%",
                "%" + q + "%",
                limit,
                offset,
              ),
            )
          : this.rows(
              this.sql.exec(
                "SELECT id,name,mime,meta,created_at,updated_at FROM native_items WHERE kind=? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                "document",
                limit,
                offset,
              ),
            );
      return json({
        documents: rows.map((r) => {
          const m = JSON.parse(r.meta || "{}");
          return {
            id: r.id,
            title: r.name,
            format: m.format || r.mime.replace(/^text\//, ""),
            tags: m.tags || [],
            version: m.version || 1,
            created_at: r.created_at,
            updated_at: r.updated_at,
          };
        }),
        pagination: pageInfo(limit, offset, rows.length),
      });
    }
    const did = safeKey(p[0]);
    if (!did) return json({ error: "Invalid document id." }, 400);
    const r = this.get("document", did);
    if (!r) return json({ error: "Document not found." }, 404);
    const oldMeta = JSON.parse(r.meta || "{}");
    if (request.method === "GET")
      return json({
        document: {
          id: r.id,
          title: r.name,
          content: r.body,
          format: oldMeta.format || r.mime.replace(/^text\//, ""),
          tags: oldMeta.tags || [],
          version: oldMeta.version || 1,
          meta: oldMeta,
          created_at: r.created_at,
          updated_at: r.updated_at,
        },
      });
    if (request.method === "PUT") {
      const b = await readJsonLimited(request, 384 * 1024),
        title = cleanName(b.title || r.name),
        content = b.content === undefined ? r.body : String(b.content),
        format = cleanName(b.format || oldMeta.format || "markdown", 40),
        tags =
          b.tags === undefined
            ? oldMeta.tags || []
            : Array.isArray(b.tags)
              ? b.tags
                  .map((x) => cleanName(x, 60))
                  .filter(Boolean)
                  .slice(0, 32)
              : [],
        version = (oldMeta.version || 1) + 1,
        meta = { ...oldMeta, ...obj(b.meta), tags, format, version };
      this.sql.exec(
        "UPDATE native_items SET name=?,mime=?,body=?,meta=?,updated_at=? WHERE kind=? AND id=?",
        title,
        "text/" + format,
        content,
        JSON.stringify(meta),
        now,
        "document",
        did,
      );
      return json({
        document: {
          id: did,
          title,
          content,
          format,
          tags,
          version,
          updated_at: now,
        },
      });
    }
    if (request.method === "DELETE") {
      this.sql.exec(
        "DELETE FROM native_items WHERE kind=? AND id=?",
        "document",
        did,
      );
      return json({ ok: true });
    }
    return json({ error: "Method not allowed." }, 405);
  }
  async knowledge(request, u, p) {
    if (request.method !== "GET" || p[0] !== "search")
      return json({ error: "Knowledge route not found." }, 404);
    const q = String(u.searchParams.get("q") || "")
      .trim()
      .slice(0, 160);
    if (!q) return json({ error: "Search query is required." }, 400);
    const { limit, offset } = pageParams(u, 25, 50),
      like = "%" + q + "%",
      rows = this.rows(
        this.sql.exec(
          "SELECT id,name,body,meta,updated_at FROM native_items WHERE kind=? AND (name LIKE ? OR body LIKE ? OR meta LIKE ?) ORDER BY updated_at DESC LIMIT ? OFFSET ?",
          "document",
          like,
          like,
          like,
          limit,
          offset,
        ),
      );
    return json({
      query: q,
      source: "unit369-native-documents",
      results: rows.map((r) => {
        const m = JSON.parse(r.meta || "{}");
        return {
          document_id: r.id,
          title: r.name,
          excerpt: excerpt(r.body, q),
          tags: m.tags || [],
          version: m.version || 1,
          updated_at: r.updated_at,
        };
      }),
      pagination: pageInfo(limit, offset, rows.length),
    });
  }
}
