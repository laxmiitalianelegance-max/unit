# Unit369

Unit369 is a Cloudflare Worker/PWA with authenticated AI chat, native workspaces and product management.

## Production architecture

- Worker: `unit`
- Entry point: `src/unit369.js`
- Base UI: `src/app.html`
- Production configuration: `wrangler.jsonc`
- Static assets: `public/`
- Per-user structured state: `NativeStore` Durable Object
- Quotas, connection secrets, shared cache and approvals: `ToolStore` Durable Object
- User files and product media: built-in `NATIVE_STORE`; optional R2 is used automatically when a `FILES` binding is added later

There is one active runtime graph. Historical wrappers and branch-specific validation workflows have been removed so CI validates the code that is actually deployed.

## Security and AI behavior

- Unit369 owner sign-in uses a private access code stored only as a Cloudflare Secret, constant-time verification, a Durable Object attempt limit and a signed HttpOnly session.
- Google OAuth is optional. When configured, it uses signed state, browser-bound flow state and PKCE; malformed non-Google client IDs are rejected before redirect.
- AI and product routes require an authenticated Unit369 account.
- Unsafe same-origin requests require a matching `Origin` header.
- The Unit369 route is primary in the UI. It uses the owner-controlled Unit369 model when configured, optional server-side AI accelerators during migration, and the native deterministic foundation as the final no-provider path.
- Production core readiness is verified against Unit369 Native and does not depend on Cloudflare AI, Claude, OpenAI or Grok availability.
- The default **Auto fallback** chat mode makes one logical AI request. Parallel provider and synthesis calls occur only in explicitly selected team modes.
- AI routes have per-account Durable Object quotas.
- Native and external mutations use short-lived, immutable, one-time approval tokens.
- Provider credentials never enter the browser bundle or local storage.

## Required production bindings and secrets

Bindings are declared in `wrangler.jsonc`: `AI`, `ASSETS`, `SELF`, `TOOL_STORE` and `NATIVE_STORE`.

Required secrets/variables:

- `APP_SECRET`
- `UNIT369_OWNER_ACCESS_CODE` — a new private passphrase of at least 16 characters, stored as a Cloudflare Secret

`ENCRYPTION_KEY` is an optional dedicated credential-encryption secret. When it is absent, Unit369 derives a domain-separated encryption key from `APP_SECRET`.

Optional provider fallback:

- `ANTHROPIC_API_KEY` and optional `ANTHROPIC_MODEL`
- `OPENAI_API_KEY` and optional `OPENAI_MODEL`
- `GROK_API_KEY` or `XAI_API_KEY`, and optional `GROK_MODEL`

Optional identity adapter:

- `GOOGLE_CLIENT_ID` — must end in `.apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET`

Optional owner-controlled Unit369 generative model:

- `UNIT369_INFERENCE_URL` — full HTTPS URL of an OpenAI-compatible chat-completions endpoint
- `UNIT369_INFERENCE_MODEL` — model identifier exposed by that endpoint
- `UNIT369_INFERENCE_TOKEN` — bearer token stored as a Cloudflare secret, never in source or browser storage
- `UNIT369_INFERENCE_THINKING` — optional `true`/`false` switch forwarded as vLLM/Qwen chat-template configuration; omit it for models that do not support this option

No AI provider key is required for the native foundation. The current independence boundary and the remaining work for a fully owner-operated generative model are documented in `docs/UNIT369_INDEPENDENCE.md`.

The bounded Runpod/vLLM deployment profile and cost controls for the first owner-operated model are documented in `docs/UNIT369_RUNPOD_DEPLOYMENT.md`.

Optional external adapters use their corresponding OAuth client secrets or manually encrypted server-side credentials.

## Local verification

```sh
# Node.js 22 or newer
npm ci
npm run ci
npm run test:smoke
```

`npm run ci` checks formatting, validates the complete import graph and PWA assets, runs unit/security tests, and performs a Wrangler production dry-run. The smoke test starts the Worker locally and verifies CSP, Unit369 owner authentication, authentication gates, native planning, manifest and icons. Unit tests verify optional Google OAuth PKCE and reject malformed Google credentials.

## Deployment

`.github/workflows/deploy-production.yml` deploys only an explicitly confirmed `main` commit. It verifies the locked source and subscription-free storage contract, performs a dry-run, deploys the exact tested commit, then checks release health, Unit369 owner authentication, CSP and PWA assets.
