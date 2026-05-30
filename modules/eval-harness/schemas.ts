import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";

export const testCaseSchema = z.object({
  name: z.string().min(1),
  project: z.string().min(1),
  input: z.record(z.unknown()),
  expectedBehavior: z.string().min(5),
});

export type TestCase = z.infer<typeof testCaseSchema>;

export const runSuiteInputSchema = z.object({
  projectSlug: z.string().min(1),
});

export const geminiJudgeSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    pass: {
      type: SchemaType.BOOLEAN,
      description: "Whether the output meets the expected behavior",
    },
    score: {
      type: SchemaType.NUMBER,
      description: "Quality score from 0 to 10",
    },
    reasoning: {
      type: SchemaType.STRING,
      description: "Brief explanation of the judgment",
    },
    issues: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Specific issues found, if any",
    },
  },
  required: ["pass", "score", "reasoning", "issues"],
};

export const judgeResultSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(10),
  reasoning: z.string(),
  issues: z.array(z.string()),
});

export type JudgeResult = z.infer<typeof judgeResultSchema>;

export type EvalResult = {
  testCase: TestCase;
  output: unknown;
  judgment: JudgeResult;
  latencyMs: number;
  error?: string;
};

export type SuiteResult = {
  project: string;
  timestamp: string;
  results: EvalResult[];
  passRate: number;
  avgScore: number;
  totalLatencyMs: number;
};
