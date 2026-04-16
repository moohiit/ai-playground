import {
  GoogleGenerativeAI,
  SchemaType,
  type Schema,
} from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables");
}

const client = new GoogleGenerativeAI(GEMINI_API_KEY);

const DEFAULT_TEXT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_VISION_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_EMBED_MODEL = "text-embedding-004";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type CompleteOptions = {
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseSchema?: Schema;
  model?: string;
};

async function callGeminiRaw(
  model: string,
  body: Record<string, unknown>
): Promise<string> {
  const url = `${API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = candidate?.finishReason ?? "unknown";
    throw new Error(`Gemini returned no content (finishReason: ${reason})`);
  }

  if (data.usageMetadata) {
    console.log(
      `[gemini] tokens — prompt: ${data.usageMetadata.promptTokenCount}, ` +
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

export async function complete(
  prompt: string,
  opts: CompleteOptions = {}
): Promise<string> {
  const modelName = opts.model ?? DEFAULT_TEXT_MODEL;
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
    },
  };

  if (opts.system) {
    body.systemInstruction = { parts: [{ text: opts.system }] };
  }

  return callGeminiRaw(modelName, body);
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
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "unknown");
    throw new Error(`Gemini stream error (${res.status}): ${err}`);
  }

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

export async function embed(text: string): Promise<number[]> {
  const model = client.getGenerativeModel({ model: DEFAULT_EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export { SchemaType };
