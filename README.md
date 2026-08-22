# Unit369

Cloudflare Worker/PWA application.

## Production

- Worker: `unit`
- Entry point: `src/unit369.js`
- UI enhancement layer: `src/enhancements.js`
- Theme layer: `src/theme.js`
- Base HTML: `src/app.html`
- Static assets: `public/`

`wrangler.toml` is the production source of truth.

## Server-side secrets

AI and Shopify credentials must be stored as Cloudflare Worker secrets/variables, never in browser localStorage:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GROK_API_KEY` or `XAI_API_KEY`
- `SHOPIFY_SHOP`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`

Optional model overrides:

- `ANTHROPIC_MODEL`
- `OPENAI_MODEL`
- `GROK_MODEL`

## Current application modules

- AI Team: Claude, OpenAI, Grok and Workers AI; conversation context, history, cross-checking and final synthesis.
- Products: draft-first workflow, preview/confirmation, SKU, product type, vendor, tags, images, optional video and recent product list.
- Settings: live integration health, application version, compact mode and AI-history reset.
- PWA: canonical manifest/service worker and exact Unit369 application logo.

The legacy wrapper files remain only as historical code and are not production entry points.
