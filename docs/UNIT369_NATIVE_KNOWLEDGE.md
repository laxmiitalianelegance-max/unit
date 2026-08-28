# Unit369 Native Knowledge

Unit369 Native Knowledge stores and searches owner-approved text without sending document contents to an external AI provider. It is a deterministic retrieval foundation, not a claim that Unit369 semantically understands every imported document.

## Supported flow

1. The authenticated owner attaches up to five UTF-8 `.txt`, `.md` or `.markdown` files and explicitly asks Unit369 to remember, save or index them.
2. Unit369 validates safe relative paths, text encoding and size limits, then stages the files privately in the owner's `NativeStore` Durable Object.
3. The chat shows the file list, byte count and SHA-256 manifest fingerprint. No staged document is searchable yet.
4. A short-lived immutable approval token authorizes exactly that import manifest once.
5. Confirmation reloads the staged files and recomputes the manifest. Any changed path, title, format, size or content fails closed.
6. Documents and their FTS5 index rows are written in one synchronous SQLite transaction.
7. The staging files and import record are removed after successful indexing.

Cancellation consumes the approval and removes the staged data without indexing it. Approval tokens are held only in browser memory and are not saved in chat history or local storage.

Unconfirmed staging data has a short expiry and is removed by the owner's `NativeStore` alarm even if the browser disappears without confirming or cancelling.

## Limits

- 5 files per import
- 128 KiB per file
- 512 KiB total per import
- TXT and Markdown only
- 10 results maximum per search
- bounded per-owner import and search quotas

PDF, Office documents, images, audio, archives and binary payloads are intentionally rejected in this first version. They require separate parsers, decompression limits and content-safety controls.

## Retrieval

Each owner has a separate `NativeStore` Durable Object. SQLite FTS5 uses Unicode tokenization, diacritic normalization, quoted prefix terms and BM25 weights favoring titles and tags. Results include a bounded excerpt, document version and original source path.

Chat search is explicit:

- `Search knowledge: Orion launch`
- `U znanju: kada se pokreće Orion?`
- `Pretraži znanje: vlasnik projekta`

Search does not require a mutation approval because it is read-only. It does require an authenticated Unit369 session and is rate-limited per owner.

## Security properties

- owner-scoped Durable Object storage
- same-origin enforcement on staging, confirmation and cancellation writes
- bounded request and response bodies
- no Worker, Cloudflare, RunPod or Shopify secret forwarded into a document
- no external inference, embedding or analytics request
- order-stable SHA-256 manifest checked again at confirmation
- one-time approval replay rejection
- atomic document/index writes
- HTML output escaped by the chat UI

## Current boundary

FTS5 provides fast lexical retrieval. Semantic embeddings, retrieval-augmented generation, document-level permissions beyond the owner boundary, OCR and format conversion are future layers and must not be described as implemented until they have their own storage, cost and safety tests.
