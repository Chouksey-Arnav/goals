// Groq chat completions, for one job: writing the end-of-day review
// (js/review.js decides what's true; Groq only writes it up). Plain fetch,
// no SDK, like supabase.js.
//
// Strict JSON-schema output, so the answer always has the right shape. If
// the model doesn't support strict mode (a GROQ_MODEL override) Groq answers
// 400 and we retry once in plain JSON mode. Either way js/review.js checks
// every line before it's emailed.

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export class GroqError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function body(model, messages, schema, mode) {
  const base = { model, messages, temperature: 0.3, max_completion_tokens: 2500 };
  if (mode === "strict") {
    return {
      ...base,
      // Judging a day well takes a little thought; the reasoning isn't returned.
      reasoning_effort: "medium",
      include_reasoning: false,
      response_format: { type: "json_schema", json_schema: { name: "review", strict: true, schema } },
    };
  }
  return {
    ...base,
    response_format: { type: "json_object" },
    messages: [...messages, { role: "user", content: `Reply with one JSON object with exactly these keys: ${Object.keys(schema.properties).join(", ")}. did and missed are arrays of {fact, line}; tomorrow is an array of {order, fact}.` }],
  };
}

async function post(cfg, payload, { timeoutMs, fetchImpl }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new GroqError(e.name === "AbortError" ? `Groq took longer than ${timeoutMs} ms.` : `Couldn't reach Groq: ${e.message}`, 0);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg = data?.error?.message || text || res.statusText;
    const hint = res.status === 401 ? " (GROQ_API_KEY is wrong: create one at console.groq.com/keys)" : res.status === 404 ? " (the model may be retired: set GROQ_MODEL)" : "";
    throw new GroqError(`Groq ${res.status}: ${String(msg).slice(0, 300)}${hint}`, res.status);
  }
  return data;
}

// -> { json, model, mode, tokens }. Throws GroqError; the caller falls back
// to the rules-only review, so a Groq failure never costs the email.
export async function askGroq(cfg, messages, schema, { timeoutMs = 25_000, fetchImpl = globalThis.fetch } = {}) {
  if (!cfg.groqKey) throw new GroqError("GROQ_API_KEY is not set.", 503);
  let mode = "strict";
  let data;
  try {
    data = await post(cfg, body(cfg.groqModel, messages, schema, mode), { timeoutMs, fetchImpl });
  } catch (e) {
    if (e.status !== 400) throw e;
    mode = "json";
    data = await post(cfg, body(cfg.groqModel, messages, schema, mode), { timeoutMs, fetchImpl });
  }
  const content = data?.choices?.[0]?.message?.content;
  try {
    return { json: JSON.parse(content), model: data.model || cfg.groqModel, mode, tokens: data.usage?.total_tokens ?? null };
  } catch {
    throw new GroqError("Groq returned something that isn't JSON.", 502);
  }
}
