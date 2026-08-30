# Unit369 owner-operated Runpod model

This profile attaches an open-weight model to Unit369 without using an OpenAI, Anthropic, xAI or Google model API. Runpod supplies raw GPU execution and the owner controls the endpoint, model and API key.

Runpod is an optional accelerator, not a production dependency. Default Unit369 chat does not call this endpoint while it is bypassed; it uses Workers AI when available and then the built-in native path. A missing Runpod balance, stopped worker or HTTP 5xx response therefore cannot block normal chat or a production deployment.

## First evaluation profile

- Runtime: Runpod Serverless vLLM worker.
- Worker type: Flex, zero minimum workers outside an explicit test window.
- Maximum workers: `1`.
- Initial active test window: temporarily set one active worker, then return it to zero after verification.
- Initial spend ceiling: `$100`; automatic payment remains disabled during evaluation.
- Model: `Qwen/Qwen3.6-35B-A3B-FP8`.
- Model license: Apache-2.0.
- Initial GPU class: H100 80 GB because this official FP8 model needs native FP8 support and sufficient VRAM.
- Public model alias: `unit369-qwen36`.

An A40 48 GB remains the cheaper fallback profile with `Qwen/Qwen3-32B-AWQ`, `QUANTIZATION=awq` and the same Unit369 contract. Do not put a community quantization into production without checksum, provenance and quality verification.

## vLLM endpoint settings

Use Runpod worker-vLLM `v2.19.0` or newer; Qwen3.6 requires vLLM `0.19.0` or newer. Pin the tested worker version instead of silently following `latest`.

Set:

```text
MODEL_NAME=Qwen/Qwen3.6-35B-A3B-FP8
MAX_MODEL_LEN=32768
GPU_MEMORY_UTILIZATION=0.92
MAX_NUM_SEQS=4
MAX_CONCURRENCY=2
ENABLE_PREFIX_CACHING=True
OPENAI_SERVED_MODEL_NAME_OVERRIDE=unit369-qwen36
REASONING_PARSER=qwen3
DISABLE_LOG_REQUESTS=True
```

The model is public, so an HF token is not required. Keep request logging disabled if the selected worker version otherwise records prompt bodies.

## Unit369 production settings

After the endpoint answers a direct test, configure Cloudflare production with:

```text
UNIT369_INFERENCE_URL=https://api.runpod.ai/v2/ENDPOINT_ID/openai/v1/chat/completions
UNIT369_INFERENCE_MODEL=unit369-qwen36
UNIT369_INFERENCE_THINKING=false
UNIT369_INFERENCE_TIMEOUT_MS=180000
UNIT369_INFERENCE_TOKEN=<Runpod API key, stored only as a Cloudflare secret>
```

The Worker must send `unit369-qwen36` unchanged in the OpenAI-compatible
`model` field. `OPENAI_SERVED_MODEL_NAME_OVERRIDE` makes that alias the accepted
request model; it must not be rewritten to the underlying Hugging Face model ID.
If the configured alias is stale or the override is absent, Unit369 handles the
documented Runpod `/models` contract: after a model-not-found response it reads
the models from that same authenticated endpoint, selects the only unambiguous
served model, retries once and caches the resolved identifier in the Worker
isolate. It never sends the token to another host and never exposes raw provider
errors through release health.
Runpod 5xx responses are retried with bounded exponential backoff inside the
same 180-second request window when an owned-model feature explicitly uses the
endpoint. A failed diagnostic probe is cached for only four seconds; successful
probes remain cached for the application version.
The production and browser request windows default to 180 and 190 seconds so a
zero-minimum-worker endpoint can complete a cold start. Runpod recommends a
longer client timeout for large models; the UI must show the warm-up state
instead of silently replacing the answer after ten seconds.

Never commit the endpoint ID/API key pair together with a live token. The API key is sent only from the Worker to Runpod and never enters the browser bundle.

## Required gates before re-enabling owned-model use

1. Direct endpoint verification passes in Serbian without exposing reasoning tags.
2. Unit369 sends `model: unit369-qwen36`, and authenticated chat returns
   `provider: unit369-owned`.
3. The optional owned-model diagnostic receives `provider: unit369-owned`; core
   release health remains independent of that diagnostic.
4. Invalid token, timeout, rate-limit and stopped-worker behavior fall back safely.
5. Prompt contents do not appear in public logs.
6. Billing shows a hard evaluation ceiling and no automatic payment.
7. Active workers return to zero after the test window.
8. Removing all commercial model credentials still leaves Unit369 Native operational.

## Cost shutdown rule

The endpoint must have no permanent active worker during evaluation. If the endpoint cannot reliably cold-start inside the Unit369 request window, choose deliberately between a scheduled warm window and an always-on monthly budget; never silently leave an active GPU running.
