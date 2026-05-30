import { z } from "zod";
import { SchemaType, type Schema } from "@google/generative-ai";

export const scrapeInputSchema = z
  .object({
    url: z.string().url("Must be a valid URL"),
    instruction: z.string().min(5, "Describe what data you want").max(500),
  })
  .strict();

export type ScrapeInput = z.infer<typeof scrapeInputSchema>;

export const geminiScrapeSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    data: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {},
      },
      description: "Array of extracted data objects matching the user's request",
    },
    summary: {
      type: SchemaType.STRING,
      description: "Brief summary of what was extracted and any caveats",
    },
    fieldNames: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
      description: "Column/field names for the extracted data",
    },
    itemCount: {
      type: SchemaType.NUMBER,
      description: "Number of items extracted",
    },
  },
  required: ["data", "summary", "fieldNames", "itemCount"],
};

export const scrapeResultSchema = z.object({
  data: z.array(z.record(z.unknown())),
  summary: z.string(),
  fieldNames: z.array(z.string()),
  itemCount: z.number(),
});

export type ScrapeResult = z.infer<typeof scrapeResultSchema>;
