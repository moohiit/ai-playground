import {
  SchemaType,
  TaskType,
  type Schema,
} from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables");
}

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_VISION_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_EMBED_MODEL = "gemini-embedding-001";
const DEFAULT_EMBED_DIMS = 768;

const API_BASE =
  process.env.GEMINI_API_BASE ??
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Thrown when Gemini is overloaded (503) or out of quota (429) even after
 * retries and fallbacks. Carries an HTTP status so handleRouteError returns
 * the message verbatim instead of a generic 500.
 */
export class GeminiError extends Error {
  constructor(
    public status: number,
    message: string,
    public upstreamStatus: number
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

const RETRYABLE_STATUSES = new Set([429, 503]);
const RETRY_DELAYS_MS = [1000, 2000];
const MAX_RETRY_AFTER_MS = 4000;
/** Stop scheduling retries and fallbacks once this much time has passed. */
const DEFAULT_RETRY_BUDGET_MS = 20_000;
/** Thinking is switched off for these when they run as a fallback (it eats the output budget). */
const NO_THINKING_FALLBACK_MODELS = new Set(["gemini-2.5-flash"]);

const BUSY_MESSAGE =
  "The AI model is busy right now. Please try again in a moment.";
const RATE_LIMITED_MESSAGE =
  "The AI service is rate-limited right now. Please try again in a minute.";
const DAILY_QUOTA_MESSAGE =
  "The AI model's free daily quota is used up. Please try again tomorrow.";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Delay before the next attempt: Retry-After / RetryInfo when present (capped), else backoff. */
function retryDelay(res: Response, detail: string, attempt: number): number {
  const header = Number(res.headers.get("retry-after"));
  const info = Number(detail.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/)?.[1]);
  const hinted = [header, info].find((n) => Number.isFinite(n) && n > 0);
  if (hinted !== undefined) return Math.min(hinted * 1000, MAX_RETRY_AFTER_MS);
  return RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
}

/**
 * fetch() that only returns OK responses. 503s and per-minute 429s are
 * retried with a short backoff: the free tier sheds load on larger prompts
 * and an identical request usually succeeds a second or two later. A per-day
 * quota 429 is never retried, it will not clear until the daily reset.
 */
async function geminiFetch(
  url: string,
  init: RequestInit,
  label: string,
  retryBudgetMs = DEFAULT_RETRY_BUDGET_MS
): Promise<Response> {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.ok) return res;

    const detail = await res.text().catch(() => "");
    if (!RETRYABLE_STATUSES.has(res.status)) {
      throw new Error(`Gemini ${label} error (${res.status}): ${detail}`);
    }

    const dailyQuota = res.status === 429 && /PerDay/.test(detail);
    const canRetry =
      !dailyQuota &&
      attempt < RETRY_DELAYS_MS.length &&
      Date.now() - started < retryBudgetMs;
    if (!canRetry) {
      console.error(
        `[gemini] ${label} ${res.status} after ${attempt + 1} attempt(s): ${detail.slice(0, 300)}`
      );
      const message = dailyQuota
        ? DAILY_QUOTA_MESSAGE
        : res.status === 429
          ? RATE_LIMITED_MESSAGE
          : BUSY_MESSAGE;
      throw new GeminiError(503, message, res.status);
    }

    const delay = retryDelay(res, detail, attempt);
    console.warn(
      `[gemini] ${label} returned ${res.status}; retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delay}ms`
    );
    await sleep(delay);
  }
}

/**
 * Try each model in order, moving on only when the previous one was busy or
 * out of quota (GeminiError). Every model has its own free-tier daily quota,
 * so a fallback both dodges overload and adds capacity.
 */
async function withModelFallback<T>(
  models: string[],
  run: (model: string, isFallback: boolean) => Promise<T>,
  retryBudgetMs = DEFAULT_RETRY_BUDGET_MS
): Promise<T> {
  const started = Date.now();
  for (const [i, model] of models.entries()) {
    try {
      return await run(model, i > 0);
    } catch (err) {
      const next = models[i + 1];
      const outOfTime = Date.now() - started >= retryBudgetMs;
      if (!(err instanceof GeminiError) || !next || outOfTime) throw err;
      console.warn(
        `[gemini] ${model} unavailable (${err.upstreamStatus}); falling back to ${next}`
      );
    }
  }
  throw new Error("No Gemini model configured");
}

type CompleteOptions = {
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseSchema?: Schema;
  model?: string;
  /** Models to try, in order, when `model` is busy or out of quota. */
  fallbackModels?: string[];
  /** Stop scheduling retries and fallbacks after this many ms (default 20s). */
  retryBudgetMs?: number;
};

async function callGeminiRaw(
  model: string,
  body: Record<string, unknown>,
  retryBudgetMs?: number
): Promise<string> {
  const url = `${API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await geminiFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "API",
    retryBudgetMs
  );

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = candidate?.finishReason ?? "unknown";
    throw new Error(`Gemini returned no content (finishReason: ${reason})`);
  }

  if (data.usageMetadata && process.env.NODE_ENV === "development") {
    console.log(
      `[gemini] prompt: ${data.usageMetadata.promptTokenCount}, ` +
        `thinking: ${data.usageMetadata.thoughtsTokenCount ?? 0}, ` +
        `output: ${data.usageMetadata.candidatesTokenCount}, ` +
        `finish: ${candidate.finishReason}`
    );
  }

  const textPart = candidate.content.parts.find(
    (p: { text?: string }) => p.text !== undefined
  );
  if (!textPart) {
    throw new Error("No text in Gemini response");
  }
  return textPart.text;
}

function buildTextBody(
  prompt: string,
  opts: CompleteOptions,
  disableThinking: boolean
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 65536,
      temperature: opts.temperature ?? 0.3,
      ...(opts.responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: opts.responseSchema,
          }
        : {}),
      ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };

  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }
  return body;
}

export async function complete(
  prompt: string,
  opts: CompleteOptions = {}
): Promise<string> {
  const models = [opts.model ?? DEFAULT_TEXT_MODEL, ...(opts.fallbackModels ?? [])];
  return withModelFallback(
    models,
    (model, isFallback) =>
      callGeminiRaw(
        model,
        buildTextBody(
          prompt,
          opts,
          isFallback && NO_THINKING_FALLBACK_MODELS.has(model)
        ),
        opts.retryBudgetMs
      ),
    opts.retryBudgetMs
  );
}

function extractJSON(raw: string): string {
  let text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }

  return text;
}

export async function* streamText(
  prompt: string,
  opts: Omit<CompleteOptions, "responseSchema"> = {}
): AsyncGenerator<string> {
  const modelName = opts.model ?? DEFAULT_TEXT_MODEL;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 65536,
      temperature: opts.temperature ?? 0.3,
    },
  };
  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  const url = `${API_BASE}/${modelName}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
  const res = await geminiFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "stream",
    opts.retryBudgetMs
  );

  if (!res.body) throw new Error("Gemini stream error: empty response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const parsed = JSON.parse(payload);
        const parts: Array<{ text?: string }> =
          parsed?.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.text) yield part.text;
        }
      } catch {
        // partial JSON — skip, next chunk will complete it
      }
    }
  }
}

export async function completeJSON<T>(
  prompt: string,
  schema: Schema,
  opts: Omit<CompleteOptions, "responseSchema"> = {}
): Promise<T> {
  const raw = await complete(prompt, {
    ...opts,
    maxOutputTokens: opts.maxOutputTokens ?? 65536,
    responseSchema: schema,
  });

  const cleaned = extractJSON(raw);
  return JSON.parse(cleaned) as T;
}

type VisionInput = {
  prompt: string;
  imageBase64: string;
  mimeType: string;
  system?: string;
  responseSchema?: Schema;
  maxOutputTokens?: number;
};

export async function vision(input: VisionInput): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [
      {
        role: "user",
        parts: [
          { text: input.prompt },
          {
            inlineData: {
              data: input.imageBase64,
              mimeType: input.mimeType,
            },
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: input.maxOutputTokens ?? 65536,
      temperature: 0.2,
      ...(input.responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: input.responseSchema,
          }
        : {}),
    },
  };

  if (input.system) {
    body.systemInstruction = { parts: [{ text: input.system }] };
  }

  return callGeminiRaw(DEFAULT_VISION_MODEL, body);
}

async function embedRest(
  texts: string[],
  taskType: TaskType,
  outputDimensionality: number
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const url = `${API_BASE}/${DEFAULT_EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;
  const body = {
    requests: texts.map((text) => ({
      model: `models/${DEFAULT_EMBED_MODEL}`,
      content: { parts: [{ text }] },
      taskType,
      outputDimensionality,
    })),
  };
  const res = await geminiFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "embed"
  );
  const data = (await res.json()) as {
    embeddings: { values: number[] }[];
  };
  // gemini-embedding-001 returns unnormalized vectors whenever
  // outputDimensionality is lower than the model's native 3072.
  // Atlas cosine similarity expects unit vectors, so normalize here.
  return data.embeddings.map((e) => l2Normalize(e.values));
}

function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  const norm = Math.sqrt(sum);
  if (norm === 0) return v;
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

export async function embed(
  text: string,
  opts: { taskType?: TaskType; outputDimensionality?: number } = {}
): Promise<number[]> {
  const [values] = await embedRest(
    [text],
    opts.taskType ?? TaskType.RETRIEVAL_DOCUMENT,
    opts.outputDimensionality ?? DEFAULT_EMBED_DIMS
  );
  return values;
}

export async function embedBatch(
  texts: string[],
  taskType: TaskType = TaskType.RETRIEVAL_DOCUMENT,
  outputDimensionality: number = DEFAULT_EMBED_DIMS
): Promise<number[][]> {
  return embedRest(texts, taskType, outputDimensionality);
}

export { SchemaType, TaskType };
