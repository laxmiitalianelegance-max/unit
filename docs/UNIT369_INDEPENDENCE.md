# Unit369 Independence Roadmap

## Meaning of independent

Unit369 Core is independent when removing Cloudflare AI, Anthropic, OpenAI and xAI credentials does not prevent the application from starting, passing release health, planning native work, or using its own data, files and tools.

Equal unrestricted language, image, speech and code-model quality is a separate milestone. It requires open-weight models running on infrastructure controlled by the Unit369 owner; a deterministic planner must never be presented as a full replacement for a large generative model.

## Phase 1: provider-independent foundation

Implemented in version `2026.08.24.1`:

- `unit369-native` is always available and has no provider credential.
- The default UI route is Unit369, not a named external model.
- The preferred inference chain is owner-controlled Unit369 model, configured optional accelerators, then Unit369 Native.
- Native chat fallback returns a transparent capability plan instead of fabricating a generative answer.
- Native product preparation preserves supplied facts and does not invent tags, sizes or claims.
- Release health probes Unit369 Native and reports external model configuration separately.
- Unit and Wrangler smoke tests prove a healthy chat response with no AI binding or provider key.

## Owned generative inference contract

Unit369 accepts an owner-controlled, OpenAI-compatible chat-completions endpoint:

- `UNIT369_INFERENCE_URL`: full HTTPS endpoint URL.
- `UNIT369_INFERENCE_MODEL`: optional model identifier; defaults to `unit369`.
- `UNIT369_INFERENCE_TOKEN`: optional bearer token stored only as a Worker secret.

Requests and responses are bounded, requests time out, URL credentials are rejected, and the endpoint must use HTTPS. This contract allows the model server and GPU host to change without changing the Unit369 product APIs or browser client.

## Remaining work before full model independence

1. Select and evaluate open-weight text, embedding, image, speech and code models against Unit369 tasks.
2. Provision an owner-controlled inference host, private access path, monitoring, backups and a cost ceiling.
3. Attach that host through the owned inference contract and pass quality, latency and failure tests.
4. Add native retrieval/research indexing, isolated code execution and durable scheduled automation.
5. Replace Google-only sign-in with a Unit369-owned authentication option so Core also works without a third-party identity provider.
6. Run provider-removal end-to-end tests with every external credential and binding disabled.

Infrastructure provisioning is intentionally not part of Phase 1 because it can create recurring GPU and operations cost. It requires a separate owner decision after model and budget evaluation.
