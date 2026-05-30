import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";

export const repoInputSchema = z.object({
  repoUrl: z
    .string()
    .url()
    .refine(
      (u) => /^https:\/\/github\.com\/[^/]+\/[^/]+/.test(u),
      "Must be a valid GitHub repository URL"
    ),
});

export type RepoInput = z.infer<typeof repoInputSchema>;

export function parseRepoUrl(url: string): { owner: string; repo: string } {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) throw new Error("Invalid GitHub URL");
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export const geminiRepoSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    overview: {
      type: SchemaType.STRING,
      description: "2-3 sentence plain-English summary of what this project does",
    },
    techStack: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "List of main technologies, frameworks, and languages used",
    },
    architecture: {
      type: SchemaType.STRING,
      description:
        "3-5 paragraph explanation of the project architecture, how components connect, and how data flows through the system",
    },
    keyFiles: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          path: { type: SchemaType.STRING },
          purpose: { type: SchemaType.STRING },
        },
        required: ["path", "purpose"],
      },
      description: "Top 8-12 most important files and what each one does",
    },
    entryPoints: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Main entry points for the application (e.g. index.ts, main.py)",
    },
    patterns: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Notable design patterns, conventions, or architectural decisions",
    },
  },
  required: [
    "overview",
    "techStack",
    "architecture",
    "keyFiles",
    "entryPoints",
    "patterns",
  ],
};

export const repoAnalysisSchema = z.object({
  overview: z.string(),
  techStack: z.array(z.string()),
  architecture: z.string(),
  keyFiles: z.array(
    z.object({ path: z.string(), purpose: z.string() })
  ),
  entryPoints: z.array(z.string()),
  patterns: z.array(z.string()),
});

export type RepoAnalysis = z.infer<typeof repoAnalysisSchema>;
