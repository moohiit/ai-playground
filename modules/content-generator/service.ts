import { completeJSON } from "@/lib/llm";
import {
  geminiOutlineSchema,
  outlineSchema,
  type BriefInput,
  type Outline,
} from "./schemas";
import { OUTLINE_SYSTEM_PROMPT, buildOutlinePrompt } from "./prompts";

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
