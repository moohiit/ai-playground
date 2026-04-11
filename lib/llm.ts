import {
  GoogleGenerativeAI,
  GenerativeModel,
  SchemaType,
  type Schema,
} from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set in environment variables");
}

const client = new GoogleGenerativeAI(GEMINI_API_KEY);

const DEFAULT_TEXT_MODEL = "gemini-2.0-flash";
const DEFAULT_VISION_MODEL = "gemini-2.0-flash";
const DEFAULT_EMBED_MODEL = "text-embedding-004";

type CompleteOptions = {
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  responseSchema?: Schema;
  model?: string;
};

function getModel(name: string, system?: string): GenerativeModel {
  return client.getGenerativeModel({
    model: name,
    ...(system ? { systemInstruction: system } : {}),
  });
}

export async function complete(
  prompt: string,
  opts: CompleteOptions = {}
): Promise<string> {
  const model = getModel(opts.model ?? DEFAULT_TEXT_MODEL, opts.system);

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      temperature: opts.temperature ?? 0.3,
      ...(opts.responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: opts.responseSchema,
          }
        : {}),
    },
  });

  return result.response.text();
}

export async function completeJSON<T>(
  prompt: string,
  schema: Schema,
  opts: Omit<CompleteOptions, "responseSchema"> = {}
): Promise<T> {
  const raw = await complete(prompt, { ...opts, responseSchema: schema });
  return JSON.parse(raw) as T;
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
  const model = getModel(DEFAULT_VISION_MODEL, input.system);

  const result = await model.generateContent({
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
      maxOutputTokens: input.maxOutputTokens ?? 1024,
      temperature: 0.2,
      ...(input.responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: input.responseSchema,
          }
        : {}),
    },
  });

  return result.response.text();
}

export async function embed(text: string): Promise<number[]> {
  const model = client.getGenerativeModel({ model: DEFAULT_EMBED_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

export { SchemaType };
