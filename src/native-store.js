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
const KNOWLEDGE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "the",
  "to",
  "what",
  "with",
  "da",
  "do",
  "iz",
  "je",
  "ko",
  "na",
  "od",
  "se",
  "sta",
  "šta",
  "u",
  "za",
]);
const KNOWLEDGE_IMPORT_COLLECTION = "__unit369_knowledge_import_v1";

export function knowledgeMatchQuery(value) {
  const normalized = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en");
  const all = [
    ...new Set((normalized.match(/[\p{L}\p{N}]{2,48}/gu) || []).slice(0, 20)),
  ];
  const useful = all.filter((token) => !KNOWLEDGE_STOP_WORDS.has(token));
  const tokens = (useful.length ? useful : all).slice(0, 12);
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(" OR ");
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
    CREATE INDEX IF NOT EXISTS idx_native_kind_updated ON native_items(kind,updated_at DESC);
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      document_id UNINDEXED,
      title,
      content,
      tags,
      tokenize='unicode61 remove_diacritics 2'
    );`);
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
  indexDocument(documentId, title, content, tags) {
    this.sql.exec("DELETE FROM knowledge_fts WHERE document_id=?", documentId);
    this.sql.exec(
      "INSERT INTO knowledge_fts(document_id,title,content,tags) VALUES(?,?,?,?)",
      documentId,
      title,
      content,
      Array.isArray(tags) ? tags.join(" ") : String(tags || ""),
    );
  }
  backfillKnowledgeIndex() {
    this.sql.exec(`INSERT INTO knowledge_fts(document_id,title,content,tags)
      SELECT item.id,item.name,item.body,item.meta
      FROM native_items item
      WHERE item.kind='document'
        AND NOT EXISTS (
          SELECT 1 FROM knowledge_fts AS fts
          WHERE fts.document_id=item.id
        )`);
  }
  async scheduleKnowledgeImportAlarm(record) {
    if (record?.type !== "knowledge-import") return;
    const expiresAt = Number(record.expires_at || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return;
    const existing = await this.state.storage.getAlarm?.();
    if (!existing || existing > expiresAt) {
      await this.state.storage.setAlarm?.(expiresAt);
    }
  }
  async alarm() {
    const now = Date.now(),
      rows = this.rows(
        this.sql.exec("SELECT id,body FROM native_items WHERE kind='record'"),
      );
    let next = null;
    this.state.storage.transactionSync(() => {
      for (const row of rows) {
        let record;
        try {
          record = JSON.parse(row.body || "{}");
        } catch {
          continue;
        }
        if (record.type !== "knowledge-import") continue;
        const expiresAt = Number(record.expires_at || 0);
        if (!Number.isFinite(expiresAt) || expiresAt <= 0) continue;
        if (expiresAt <= now) {
          this.sql.exec(
            "DELETE FROM native_items WHERE kind='file' AND parent_id=?",
            row.id,
          );
          this.sql.exec(
            "DELETE FROM native_items WHERE kind='record' AND id=?",
            row.id,
          );
        } else if (next === null || expiresAt < next) {
          next = expiresAt;
        }
      }
    });
    if (next !== null) await this.state.storage.setAlarm?.(next);
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
      await this.scheduleKnowledgeImportAlarm(record);
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
        meta = { ...obj(b.meta), tags, format, version: 1 };
      this.state.storage.transactionSync(() => {
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
        this.indexDocument(did, title, content, tags);
      });
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
      this.state.storage.transactionSync(() => {
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
        this.indexDocument(did, title, content, tags);
      });
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
      this.state.storage.transactionSync(() => {
        this.sql.exec(
          "DELETE FROM native_items WHERE kind=? AND id=?",
          "document",
          did,
        );
        this.sql.exec("DELETE FROM knowledge_fts WHERE document_id=?", did);
      });
      return json({ ok: true });
    }
    return json({ error: "Method not allowed." }, 405);
  }
  async knowledge(request, u, p) {
    if (request.method === "GET" && p[0] === "staging") {
      let collection = this.rows(
        this.sql.exec(
          "SELECT id,name,body schema,created_at,updated_at FROM native_items WHERE kind='collection' AND name=? ORDER BY created_at ASC LIMIT 1",
          KNOWLEDGE_IMPORT_COLLECTION,
        ),
      )[0];
      if (!collection) {
        const now = Date.now(),
          collectionId = id("c"),
          schema = JSON.stringify({
            type: "knowledge-import",
            manifest_hash: "string",
            status: "staged",
          });
        this.state.storage.transactionSync(() => {
          collection = this.rows(
            this.sql.exec(
              "SELECT id,name,body schema,created_at,updated_at FROM native_items WHERE kind='collection' AND name=? ORDER BY created_at ASC LIMIT 1",
              KNOWLEDGE_IMPORT_COLLECTION,
            ),
          )[0];
          if (collection) return;
          this.sql.exec(
            "INSERT INTO native_items(kind,id,name,body,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            "collection",
            collectionId,
            KNOWLEDGE_IMPORT_COLLECTION,
            schema,
            now,
            now,
          );
          collection = {
            id: collectionId,
            name: KNOWLEDGE_IMPORT_COLLECTION,
            schema,
            created_at: now,
            updated_at: now,
          };
        });
      }
      return json({
        collection: {
          ...collection,
          schema:
            typeof collection.schema === "string"
              ? JSON.parse(collection.schema || "{}")
              : collection.schema,
        },
      });
    }
    if (request.method === "POST" && p[0] === "import") {
      const b = await readJsonLimited(request, 768 * 1024),
        tags = Array.isArray(b.tags)
          ? b.tags
              .map((item) => cleanName(item, 60))
              .filter(Boolean)
              .slice(0, 16)
          : [],
        sourceImportId = safeKey(b.source_import_id),
        files = Array.isArray(b.files) ? b.files : [];
      if (!files.length)
        return json({ error: "Knowledge files are required." }, 400);
      if (files.length > 5) {
        throw new HttpError(
          413,
          "Knowledge import accepts at most 5 documents.",
          "too_many_knowledge_documents",
        );
      }
      if (!sourceImportId) {
        throw new HttpError(
          400,
          "Knowledge import source is invalid.",
          "invalid_knowledge_import_source",
        );
      }
      let totalBytes = 0;
      const documents = files.map((file) => {
        const title = cleanName(file?.title, 160),
          content = String(file?.content ?? ""),
          format = ["text", "markdown"].includes(file?.format)
            ? file.format
            : "text",
          path = cleanName(file?.path, 240);
        if (!title || !content.trim() || content.includes("\u0000")) {
          throw new HttpError(
            400,
            "Knowledge document is invalid.",
            "invalid_knowledge_document",
          );
        }
        const contentBytes = new TextEncoder().encode(content).byteLength;
        if (contentBytes > 128 * 1024) {
          throw new HttpError(
            413,
            "Knowledge document exceeds the storage limit.",
            "knowledge_document_too_large",
          );
        }
        totalBytes += contentBytes;
        if (totalBytes > 512 * 1024) {
          throw new HttpError(
            413,
            "Knowledge import exceeds the aggregate storage limit.",
            "knowledge_import_too_large",
          );
        }
        return {
          id: id("d"),
          title,
          content,
          format,
          path,
          meta: {
            tags,
            format,
            version: 1,
            source_path: path,
            source_import_id: sourceImportId,
          },
        };
      });
      const now = Date.now();
      this.state.storage.transactionSync(() => {
        for (const document of documents) {
          this.sql.exec(
            "INSERT INTO native_items(kind,id,name,mime,body,meta,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
            "document",
            document.id,
            document.title,
            document.format === "markdown" ? "text/markdown" : "text/plain",
            document.content,
            JSON.stringify(document.meta),
            now,
            now,
          );
          this.indexDocument(
            document.id,
            document.title,
            document.content,
            tags,
          );
        }
      });
      return json(
        {
          documents: documents.map((document) => ({
            id: document.id,
            title: document.title,
            format: document.format,
            source_path: document.path,
            tags,
            version: 1,
            created_at: now,
            updated_at: now,
          })),
        },
        201,
      );
    }
    if (request.method !== "GET" || p[0] !== "search")
      return json({ error: "Knowledge route not found." }, 404);
    const q = String(u.searchParams.get("q") || "")
      .trim()
      .slice(0, 240);
    if (!q) return json({ error: "Search query is required." }, 400);
    const match = knowledgeMatchQuery(q);
    if (!match)
      return json({ error: "Search query needs a searchable term." }, 400);
    this.backfillKnowledgeIndex();
    const { limit, offset } = pageParams(u, 5, 10),
      rows = this.rows(
        this.sql.exec(
          `SELECT item.id,item.name,
             snippet(knowledge_fts,2,'','',' … ',40) excerpt,
             item.meta,item.updated_at,
             bm25(knowledge_fts,0.0,6.0,1.0,2.0) score
           FROM knowledge_fts
           JOIN native_items item
             ON item.kind='document' AND item.id=knowledge_fts.document_id
           WHERE knowledge_fts MATCH ?
           ORDER BY score ASC,item.updated_at DESC
           LIMIT ? OFFSET ?`,
          match,
          limit,
          offset,
        ),
      );
    return json({
      query: q,
      source: "unit369-durable-object-sqlite-fts5",
      results: rows.map((r, index) => {
        const m = JSON.parse(r.meta || "{}");
        return {
          document_id: r.id,
          title: r.name,
          excerpt: String(r.excerpt || "")
            .replace(/\s+/g, " ")
            .slice(0, 700),
          tags: m.tags || [],
          version: m.version || 1,
          source_path: m.source_path || "",
          rank: offset + index + 1,
          updated_at: r.updated_at,
        };
      }),
      pagination: pageInfo(limit, offset, rows.length),
    });
  }
}
