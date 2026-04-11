import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";

export const analyzeInputSchema = z.object({
  resumeText: z.string().min(50, "Resume text is too short").max(20_000),
  jdText: z.string().min(30, "Job description is too short").max(10_000),
});

export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

export const tailoredBulletSchema = z.object({
  original: z.string(),
  rewritten: z.string(),
  reasoning: z.string(),
});

export const analysisResultSchema = z.object({
  score: z.number().min(0).max(100),
  summary: z.string(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  tailoredBullets: z.array(tailoredBulletSchema).max(5),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const geminiAnalysisSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    score: {
      type: SchemaType.NUMBER,
      description: "Overall match score from 0 to 100",
    },
    summary: {
      type: SchemaType.STRING,
      description: "One-paragraph summary of how well the resume fits the JD",
    },
    matchedSkills: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Skills from the JD that are clearly present in the resume",
    },
    missingSkills: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Skills required by the JD that are missing from the resume",
    },
    strengths: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Top 3-5 strengths of the candidate for this role",
    },
    gaps: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Top 3-5 gaps or weaknesses to address",
    },
    tailoredBullets: {
      type: SchemaType.ARRAY,
      description:
        "3 existing resume bullets rewritten to better match the JD",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          original: { type: SchemaType.STRING },
          rewritten: { type: SchemaType.STRING },
          reasoning: { type: SchemaType.STRING },
        },
        required: ["original", "rewritten", "reasoning"],
      },
    },
  },
  required: [
    "score",
    "summary",
    "matchedSkills",
    "missingSkills",
    "strengths",
    "gaps",
    "tailoredBullets",
  ],
};
