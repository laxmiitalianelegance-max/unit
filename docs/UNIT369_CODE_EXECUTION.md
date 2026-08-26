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

## Runtime and cost boundary

The Worker pins both `@cloudflare/sandbox` and the container image to `0.12.8`. The Python image includes NumPy, Pandas and Matplotlib; Unit369 adds scikit-learn.

Cloudflare Containers require the Workers Paid plan. Container, Worker, Durable Object, egress and optional log usage are billed under Cloudflare's current rates. Production deployment must therefore remain an explicit owner decision; committing this runtime does not itself subscribe the account or start a container.
