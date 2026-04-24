import { z } from "zod";

export const MAX_VIDEO_DURATION_SEC = 60 * 60;
export const MAX_CHUNK_CHARS = 1800;
export const MAX_CHUNK_SECONDS = 45;
export const EMBEDDING_DIMS = 768;
export const RETRIEVAL_K = 6;
export const MIN_RETRIEVAL_SCORE = 0.45;

export const ingestInputSchema = z.object({
  url: z.string().url(),
});

export type IngestInput = z.infer<typeof ingestInputSchema>;

export const videoSummarySchema = z.object({
  id: z.string(),
  videoId: z.string(),
  title: z.string(),
  author: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  durationSec: z.number(),
  chunkCount: z.number(),
  status: z.enum(["processing", "ready", "failed"]),
  errorMessage: z.string().optional(),
  createdAt: z.string(),
});

export type VideoSummary = z.infer<typeof videoSummarySchema>;

export const askInputSchema = z.object({
  videoId: z.string().min(1),
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
  startSec: z.number(),
  endSec: z.number(),
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

export function parseYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
      }
      const route = u.pathname.match(
        /^\/(shorts|embed|v|live)\/([A-Za-z0-9_-]{11})/
      );
      if (route) return route[2];
    }
  } catch {
    return null;
  }
  return null;
}
