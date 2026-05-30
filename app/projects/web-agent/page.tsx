import { WebAgentClient } from "./WebAgentClient";

export const metadata = {
  title: "Web Scraping Agent · AI Playground",
  description:
    "Describe the data you want from any webpage. The AI agent fetches the page and returns clean structured JSON.",
};

export default function WebAgentPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to projects
        </a>
        <h1 className="text-3xl font-bold tracking-tight">
          Web Scraping Agent
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Give a URL and describe what data you want in plain English. The
          agent fetches the page, sends the HTML to Gemini, and returns
          clean structured JSON you can copy or export.
        </p>
      </header>
      <WebAgentClient />
    </div>
  );
}
