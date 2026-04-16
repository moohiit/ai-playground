import { completeJSON, streamText } from "@/lib/llm";
import {
  LENGTH_WORDS,
  derivativesSchema,
  geminiDerivativesSchema,
  geminiOutlineSchema,
  outlineSchema,
  type BriefInput,
  type Derivatives,
  type DraftInput,
  type Outline,
} from "./schemas";
import {
  DERIVATIVES_SYSTEM_PROMPT,
  DRAFT_SYSTEM_PROMPT,
  OUTLINE_SYSTEM_PROMPT,
  buildDerivativesPrompt,
  buildDraftPrompt,
  buildOutlinePrompt,
} from "./prompts";

export async function generateOutline(brief: BriefInput): Promise<Outline> {
  const raw = await completeJSON<unknown>(
    buildOutlinePrompt(brief),
    geminiOutlineSchema,
    {
      system: OUTLINE_SYSTEM_PROMPT,
      maxOutputTokens: 1024,
      temperature: 0.6,
    }
  );

  const parsed = outlineSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Model returned invalid outline: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function* streamDraft(
  input: DraftInput
): AsyncGenerator<string> {
  const { outline, ...brief } = input;
  const targetWords = LENGTH_WORDS[brief.length];
  const maxTokens = Math.min(8192, Math.round(targetWords * 2.5));

  for await (const chunk of streamText(buildDraftPrompt(brief, outline), {
    system: DRAFT_SYSTEM_PROMPT,
    maxOutputTokens: maxTokens,
    temperature: 0.7,
  })) {
    yield chunk;
  }
}

export async function generateDerivatives(
  article: string
): Promise<Derivatives> {
  const raw = await completeJSON<unknown>(
    buildDerivativesPrompt(article),
    geminiDerivativesSchema,
    {
      system: DERIVATIVES_SYSTEM_PROMPT,
      maxOutputTokens: 2048,
      temperature: 0.5,
    }
  );

  const parsed = derivativesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Model returned invalid derivatives: ${parsed.error.message}`
    );
  }
  return parsed.data;
}
