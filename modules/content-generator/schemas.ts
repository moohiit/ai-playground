import { z } from "zod";

export const TONES = [
  "professional",
  "casual",
  "witty",
  "academic",
  "storytelling",
] as const;

export const LENGTHS = ["short", "medium", "long"] as const;

export const LENGTH_WORDS: Record<(typeof LENGTHS)[number], number> = {
  short: 400,
  medium: 800,
  long: 1500,
};

export const briefInputSchema = z.object({
  topic: z.string().min(5, "Topic is too short").max(300),
  audience: z.string().max(200).optional().default(""),
  tone: z.enum(TONES).default("professional"),
  length: z.enum(LENGTHS).default("medium"),
  keywords: z.array(z.string().min(1).max(60)).max(10).optional().default([]),
  notes: z.string().max(2_000).optional().default(""),
});

export type BriefInput = z.infer<typeof briefInputSchema>;

export const outlineSectionSchema = z.object({
  heading: z.string(),
  summary: z.string(),
});

export const outlineSchema = z.object({
  title: z.string(),
  hook: z.string(),
  sections: z.array(outlineSectionSchema).min(2).max(10),
});

export type Outline = z.infer<typeof outlineSchema>;

export const draftInputSchema = briefInputSchema.extend({
  outline: outlineSchema,
});

export type DraftInput = z.infer<typeof draftInputSchema>;

export const derivativesSchema = z.object({
  metaTitle: z.string(),
  metaDescription: z.string(),
  slug: z.string(),
  tags: z.array(z.string()).max(8),
  twitterThread: z.array(z.string()).max(7),
  linkedinPost: z.string(),
});

export type Derivatives = z.infer<typeof derivativesSchema>;
