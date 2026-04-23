import { z } from "zod";

export const MAX_PDF_BYTES = 6 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;

export const CHUNK_CHARS = 1800;
export const CHUNK_OVERLAP = 200;

export const EMBEDDING_DIMS = 768;
export const RETRIEVAL_K = 6;
export const MIN_RETRIEVAL_SCORE = 0.55;

export const documentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  sizeBytes: z.number(),
  pageCount: z.number(),
  chunkCount: z.number(),
  status: z.enum(["processing", "ready", "failed"]),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
});

export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const askInputSchema = z.object({
  documentId: z.string().min(1),
  question: z.string().min(3).max(1_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(10)
    .optional()
    .default([]),
});

export type AskInput = z.infer<typeof askInputSchema>;

export const citationSchema = z.object({
  chunkIndex: z.number(),
  pageStart: z.number(),
  pageEnd: z.number(),
  snippet: z.string(),
  score: z.number(),
});

export type Citation = z.infer<typeof citationSchema>;

export const askResultSchema = z.object({
  answer: z.string(),
  citations: z.array(citationSchema),
  grounded: z.boolean(),
});

export type AskResult = z.infer<typeof askResultSchema>;
