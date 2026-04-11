import { completeJSON } from "@/lib/llm";
import {
  analysisResultSchema,
  geminiAnalysisSchema,
  type AnalysisResult,
  type AnalyzeInput,
} from "./schemas";
import { SYSTEM_PROMPT, buildAnalyzePrompt } from "./prompts";

export async function analyzeResume(
  input: AnalyzeInput
): Promise<AnalysisResult> {
  const raw = await completeJSON<unknown>(
    buildAnalyzePrompt(input.resumeText, input.jdText),
    geminiAnalysisSchema,
    {
      system: SYSTEM_PROMPT,
      maxOutputTokens: 2048,
      temperature: 0.2,
    }
  );

  const parsed = analysisResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Model returned invalid analysis: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export async function extractPdfText(file: File): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = await file.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}
