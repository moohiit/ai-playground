import { completeJSON } from "@/lib/llm";
import {
  geminiScrapeSchema,
  scrapeResultSchema,
  type ScrapeInput,
  type ScrapeResult,
} from "./schemas";
import { SYSTEM_PROMPT, buildScrapePrompt } from "./prompts";

function stripHtml(html: string): string {
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "");

  if (cleaned.length > 30_000) {
    cleaned = cleaned.slice(0, 30_000) + "\n<!-- truncated -->";
  }

  return cleaned;
}

export async function scrapeUrl(input: ScrapeInput): Promise<ScrapeResult> {
  const res = await fetch(input.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; AIPlayground/1.0; +https://github.com)",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error(
      `URL returned ${contentType}. Only HTML pages are supported.`
    );
  }

  const html = await res.text();
  const stripped = stripHtml(html);

  const raw = await completeJSON<unknown>(
    buildScrapePrompt(input.instruction, stripped),
    geminiScrapeSchema,
    { system: SYSTEM_PROMPT, maxOutputTokens: 8192 }
  );

  const parsed = scrapeResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Extraction failed: ${parsed.error.message}`);
  }

  return parsed.data;
}
