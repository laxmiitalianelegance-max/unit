# Unit369 isolated code execution

Unit369 can execute Python, JavaScript and TypeScript inside an owner-scoped Cloudflare Sandbox container. The language model proposes code; the execution service is a separate, bounded capability and never receives provider, commerce or infrastructure secrets.

## Safety contract

- Authentication is required by the parent `/api/native/*` router.
- Every run requires an immutable, short-lived, one-time approval.
- Arbitrary shell commands are not exposed.
- Code is limited to 32,000 characters and 30 seconds.
- Each owner is limited to 20 executions per hour and 100 per day.
- Each owner receives a stable, hashed sandbox identity; email addresses and raw account IDs are not used as container labels.
- Stdout, stderr, rich results and images are bounded before returning to the client.
- HTML results are returned only as untrusted text.
- No Worker secret or environment variable is forwarded into the sandbox.
- One `basic` container may exist at a time and sleeps after five minutes of inactivity.

## API contract

Inspect availability:

```http
GET /api/native/code/capabilities
```

Create an execution approval:

```http
POST /api/native/code/plan
Content-Type: application/json

{
  "language": "python",
  "code": "print(2 + 2)",
  "timeout_ms": 5000
}
```

The chat UI creates the same approval only for an explicit slash command. Ordinary
messages and pasted code remain normal chat content:

```text
/run python
print(2 + 2)
```

`/run javascript` and `/run typescript` are also supported. The code and its
digest, language, size and timeout are displayed before the owner chooses
**Approve and run** or **Cancel**. The one-time token remains in memory and is never
written to browser storage.

The response contains `approval.id` and `approval.token`. Confirm exactly that approved payload:

```http
POST /api/native/code/confirm
Content-Type: application/json

{
  "approval_id": "approval_...",
  "approval_token": "..."
}
```

The token expires after ten minutes and cannot be replayed. A successful response includes bounded logs, typed results, a code digest and execution timing.

Cancel without executing:

```http
POST /api/native/code/cancel
Content-Type: application/json

{
  "approval_id": "approval_...",
  "approval_token": "..."
}
```

A cancelled approval cannot be confirmed later. If the browser loses the result
of a confirm request, the UI reports an unknown outcome and does not retry the
execution automatically.

## Multi-file project execution

The chat composer can import up to 20 UTF-8 project files. Unit369 stores them in
an owner-scoped workspace, calculates a manifest hash from every path, size and
file hash, and shows that manifest before requesting approval. Confirmation
reloads every source file and rejects the run if the manifest changed.

The supported operations are server-defined `check`, `test` and `run`. They use
Python or JavaScript commands selected by Unit369; the client cannot submit an
arbitrary shell command. This release does not install Node dependencies.
`requirements.txt` may reference only NumPy, Pandas, Matplotlib and
scikit-learn, which are already present in the pinned image.

Project execution limits are 20 files, 128 KiB per file, 512 KiB total source
and 30 seconds. Every run uses a temporary sandbox that is destroyed after the
result is collected. No Worker secret is forwarded. A project may write output
files to the directory named by `UNIT369_OUTPUT_DIR`; Unit369 stores at most
eight files, 256 KiB each and 1 MiB total, and exposes them only as owner-scoped
downloads.

## Guided Data Lab

The chat composer recognizes record-oriented CSV, TSV and JSON attachments plus
XLSX workbooks as a Data Lab dataset. It supports four server-defined operations:
`profile`, `clean`, `chart` and `predict`. It returns bounded row previews, column types,
missing/unique counts, numeric summaries and owner-scoped downloadable output.
Cleaning removes fully empty and duplicate rows and neutralizes string cells
that spreadsheet software could interpret as formulas. Chart mode selects a
bounded Matplotlib chart and returns both an in-chat PNG preview and the source
artifact.

XLSX input is base64 encoded in transit and storage, written to the Sandbox with
the SDK's binary-file mode and read from the first worksheet. Before openpyxl is
called, Unit369 verifies the ZIP signature, required workbook metadata, member
count, member paths, encryption flag, compressed ratio and a 24 MiB total
uncompressed ceiling. The image pins openpyxl and installs defusedxml because
openpyxl does not protect untrusted XML by itself.

Prediction accepts exactly one file and requires the target column to be named
explicitly in the approval. Unit369 automatically chooses classification or
regression, limits training to 5,000 rows and 20 usable features, separates a
deterministic test set, compares the fitted result with a simple baseline and
exports at most 1,000 evaluation rows. It uses a bounded logistic-regression or
ridge-regression pipeline with numeric imputation/scaling and categorical
one-hot encoding. Custom estimators and hyperparameters are not accepted. The
model is temporary, is never serialized or persisted, and every result is
labelled exploratory rather than a guaranteed forecast.

Data Lab accepts at most five files, 1 MiB per file and 3 MiB total. Text input
must be UTF-8 and XLSX input uses validated base64. Each
file is limited to 100,000 rows and 100 columns during analysis. Unit369 stores
the input first, hashes every path, size and file content, and places only that
manifest plus the chosen operation in the approval. Confirmation reloads the
stored inputs and rejects any changed manifest before a Sandbox is created.

The Sandbox receives a fixed Unit369-authored Python script and fixed command;
the browser cannot provide Python or shell text through the Data Lab API. Only
six non-secret runtime variables identify input, output and configuration
paths. The temporary Sandbox is destroyed in `finally`, including after an
error or timeout. Results are limited to eight artifacts, 2 MiB each and 4 MiB
total.

## Runtime and cost boundary

The Worker pins both `@cloudflare/sandbox` and the container image to `0.12.8`. The Python image includes NumPy, Pandas and Matplotlib; Unit369 pins scikit-learn, openpyxl and defusedxml.

Cloudflare Containers require the Workers Paid plan. Container, Worker, Durable Object, egress and optional log usage are billed under Cloudflare's current rates. Production deployment must therefore remain an explicit owner decision; committing this runtime does not itself subscribe the account or start a container.
