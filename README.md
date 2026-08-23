# Unit369

Unit369 is a Cloudflare Workers application that combines an AI chat team with Shopify product management.

## Production architecture

The production entry point is **`src/runtime.js`** as declared in `wrangler.toml`.

Runtime ownership is deliberately single-layered:

- `src/runtime.js` owns API coordination, current provider defaults, PWA responses, security headers and the application version.
- `src/unit369.js` remains the server-side core for Workers AI, Shopify and existing API compatibility.
- `src/enhancements.js` is only a compatibility alias to `src/worker.js`; it no longer injects or restructures HTML.
- `src/worker.js` serves the application shell and delegates static files to the Cloudflare `ASSETS` binding.
- `src/app.html` contains the only application DOM shell.
- `public/runtime-css/*` is bundled into the single `/runtime.css` response and contains the only active application layout/theme.
- `public/runtime-js/*` is bundled into the single `/runtime.js` response and contains the only active browser runtime for navigation, chat, language, settings and product workflow.

The older `*-safe.js`, theme and router files are retained only as historical reference. They are not in the production import path.

## Runtime guarantees

- One sidebar, one composer and one navigation owner.
- No response-wrapper chain that repeatedly rewrites the same HTML.
- All interface text follows the selected application language.
- AI replies receive the same selected-language instruction.
- Serbian uses standard natural Serbian with Ekavian preference when the user writes Ekavian.
- Chat history and existing local preferences keep their previous storage keys for migration-free continuity.
- HTML is always served with `no-store`; versioned static assets are managed by a single service worker cache.
- API keys remain server-side.

## Local validation

```bash
node --check src/runtime.js
node --check src/unit369.js
node --check src/worker.js
node --check src/enhancements.js
cat public/runtime-js/*.txt > /tmp/unit369-runtime.js
node --check /tmp/unit369-runtime.js
npx wrangler@4 deploy --dry-run --outdir .wrangler-dist
```

The GitHub Actions runtime validation also opens the application in Chromium and checks mobile navigation, duplicate ownership, chat send/persistence, language switching including RTL, settings and product workflow.

## Required bindings and secrets

Cloudflare bindings:

- `AI` — Workers AI
- `ASSETS` — static assets from `public/`

Optional server-side secrets/variables:

- `OPENAI_API_KEY`, optional `OPENAI_MODEL`
- `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`
- `GROK_API_KEY` or `XAI_API_KEY`, optional `GROK_MODEL`
- `WORKERS_AI_MODEL`
- `SHOPIFY_SHOP`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`

## Deployment

Deploy only after the runtime workflow passes:

```bash
npx wrangler@4 deploy
```
