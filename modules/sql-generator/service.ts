import { completeJSON } from "@/lib/llm";
import {
  generateResultSchema,
  geminiSqlSchema,
  type GenerateInput,
  type GenerateResult,
  type ExecuteInput,
} from "./schemas";
import { SYSTEM_PROMPT, buildGeneratePrompt } from "./prompts";
import { validateSelectOnly, validateDdlSafe } from "./validator";
import { runSandboxQuery, type QueryResult } from "./sandbox";

export async function generateSql(
  input: GenerateInput
): Promise<GenerateResult> {
  const raw = await completeJSON<unknown>(
    buildGeneratePrompt(input.schema, input.question),
    geminiSqlSchema,
    {
      system: SYSTEM_PROMPT,
      maxOutputTokens: 1024,
      temperature: 0.1,
    }
  );

  const parsed = generateResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Model returned invalid SQL response: ${parsed.error.message}`
    );
  }

  const result = parsed.data;
  const validation = validateSelectOnly(result.sql);
  if (!validation.ok) {
    return {
      ...result,
      warnings: [
        ...result.warnings,
        `Generated query was rejected by the safety validator: ${validation.error}`,
      ],
    };
  }

  return { ...result, sql: validation.cleaned };
}

export async function executeSql(input: ExecuteInput): Promise<QueryResult> {
  const ddlCheck = validateDdlSafe(input.ddl);
  if (!ddlCheck.ok) throw new Error(ddlCheck.error);

  const queryCheck = validateSelectOnly(input.query);
  if (!queryCheck.ok) throw new Error(queryCheck.error);

  return runSandboxQuery(input.ddl, input.seed, queryCheck.cleaned);
}
