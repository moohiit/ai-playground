import { MatcherClient } from "./MatcherClient";

export const metadata = {
  title: "Resume ↔ JD Matcher · AI Playground",
  description:
    "Upload a resume and job description. Get a match score, skill gaps, and tailored bullet rewrites.",
};

export default function ResumeMatcherPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <a
          href="/"
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to projects
        </a>
        <h1 className="text-3xl font-bold tracking-tight">
          Resume ↔ JD Matcher
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Paste or upload a resume and a job description. Gemini analyzes the
          fit, highlights matched and missing skills, and rewrites three of
          your bullets to better match the role.
        </p>
      </header>
      <MatcherClient />
    </div>
  );
}
