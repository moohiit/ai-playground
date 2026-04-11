import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";

export const generateInputSchema = z.object({
  schema: z.string().min(20, "Schema is too short").max(10_000),
  question: z.string().min(3, "Question is too short").max(500),
});

export type GenerateInput = z.infer<typeof generateInputSchema>;

export const generateResultSchema = z.object({
  sql: z.string(),
  explanation: z.string(),
  warnings: z.array(z.string()).default([]),
});

export type GenerateResult = z.infer<typeof generateResultSchema>;

export const geminiSqlSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    sql: {
      type: SchemaType.STRING,
      description: "A single SQL SELECT query answering the question",
    },
    explanation: {
      type: SchemaType.STRING,
      description:
        "A plain-English explanation of what the query does, 2-4 sentences",
    },
    warnings: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description:
        "Any warnings, assumptions, or caveats about the query or data",
    },
  },
  required: ["sql", "explanation", "warnings"],
};

export const executeInputSchema = z.object({
  ddl: z.string().min(20).max(10_000),
  seed: z.string().max(50_000).default(""),
  query: z.string().min(5).max(5_000),
});

export type ExecuteInput = z.infer<typeof executeInputSchema>;
