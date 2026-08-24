const endpoint = String(process.env.UNIT369_INFERENCE_URL || "").trim();
const model = String(process.env.UNIT369_INFERENCE_MODEL || "").trim();
const token = String(process.env.UNIT369_INFERENCE_TOKEN || "").trim();
const timeoutMs = Math.max(
  10_000,
  Math.min(300_000, Number(process.env.UNIT369_TEST_TIMEOUT_MS) || 180_000),
);

if (!endpoint || !model || !token) {
  throw new Error(
    "Set UNIT369_INFERENCE_URL, UNIT369_INFERENCE_MODEL and UNIT369_INFERENCE_TOKEN before running this live verification.",
  );
}

const url = new URL(endpoint);
if (url.protocol !== "https:" || url.username || url.password) {
  throw new Error(
    "UNIT369_INFERENCE_URL must be HTTPS without URL credentials.",
  );
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);
const started = Date.now();

try {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are Unit369. Reply in natural Serbian Latin script. Be direct and accurate.",
        },
        {
          role: "user",
          content:
            "Odgovori jednom kratkom rečenicom: Ko si i da li radiš na modelu koji kontroliše vlasnik Unit369?",
        },
      ],
      max_tokens: 300,
      stream: false,
      temperature: 0.7,
      top_p: 0.8,
      presence_penalty: 1.5,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: controller.signal,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Owned inference returned HTTP ${response.status}: ${text.slice(0, 1_000)}`,
    );
  }

  const data = JSON.parse(text);
  const content = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new Error("Owned inference returned an empty answer.");

  console.log(
    JSON.stringify(
      {
        operational: true,
        model,
        latency_ms: Date.now() - started,
        answer: content.slice(0, 1_000),
      },
      null,
      2,
    ),
  );
} finally {
  clearTimeout(timer);
}
