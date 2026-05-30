import { RepoClient } from "./RepoClient";

export const metadata = {
  title: "GitHub Repo Explainer · AI Playground",
  description:
    "Point at a public GitHub repo and get a plain-English architecture tour.",
};

export default function RepoExplainerPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to projects
        </a>
        <h1 className="text-3xl font-bold tracking-tight">
          GitHub Repo Explainer
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Paste a public GitHub repository URL. Gemini fetches the file tree
          and key files, then explains the architecture, tech stack, data
          flow, and design patterns in plain English.
        </p>
      </header>
      <RepoClient />
    </div>
  );
}
