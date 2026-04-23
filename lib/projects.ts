import type { ProjectCardProps } from "@/components/shared/ProjectCard";

export const projects: ProjectCardProps[] = [
  {
    title: "Resume ↔ JD Matcher",
    description:
      "Upload a resume and a job description. Get a match score, skill gaps, and tailored bullet rewrites.",
    tags: ["LLM", "Structured Output", "PDF"],
    href: "/projects/resume-matcher",
    status: "live",
  },
  {
    title: "Natural Language → SQL",
    description:
      "Describe what you want in plain English. Get valid SQL, an explanation, and safe execution on sample data.",
    tags: ["LLM", "SQL", "Sandbox"],
    href: "/projects/sql-generator",
    status: "live",
  },
  {
    title: "Expense Tracker",
    description:
      "Track personal and group expenses, scan receipts with AI, smart splitting, and monthly reports with charts.",
    tags: ["Vision", "Groups", "Reports", "Splitting"],
    href: "/projects/expense-tracker",
    status: "live",
  },
  {
    title: "AI Content Generator",
    description:
      "Turn a short brief into a streamed blog post, with an editable outline, SEO metadata, and ready-to-post social blurbs.",
    tags: ["LLM", "Streaming", "Markdown", "SEO"],
    href: "/projects/content-generator",
    status: "live",
  },
  {
    title: "PDF Chat (RAG)",
    description:
      "Upload a PDF and ask grounded questions about it. Answers come with citations to the exact pages they're drawn from.",
    tags: ["RAG", "Embeddings", "Vector Search"],
    href: "/projects/pdf-chat",
    status: "live",
  },
  {
    title: "YouTube Video Q&A",
    description:
      "Paste a YouTube URL, ask questions about the video. RAG over the transcript with timestamped citations jumping to the exact moment.",
    tags: ["RAG", "Transcripts", "Citations"],
    href: "/projects/youtube-qa",
    status: "coming-soon",
  },
  {
    title: "GitHub Repo Explainer",
    description:
      "Point it at a public repo. Get a plain-English tour of the architecture, key files, and how data flows through the code.",
    tags: ["Code", "Tree-sitter", "RAG"],
    href: "/projects/repo-explainer",
    status: "coming-soon",
  },
  {
    title: "Web Scraping Agent",
    description:
      "Describe the data you want in plain English. The agent browses the page with tool use and returns clean structured JSON.",
    tags: ["Agents", "Tool Use", "Playwright"],
    href: "/projects/web-agent",
    status: "coming-soon",
  },
  {
    title: "Voice Assistant",
    description:
      "Talk to a Gemini-powered assistant in the browser. Whisper for speech-to-text, Gemini for reasoning, TTS for the reply.",
    tags: ["Voice", "Whisper", "TTS"],
    href: "/projects/voice-assistant",
    status: "coming-soon",
  },
  {
    title: "LLM Eval Harness",
    description:
      "LLM-as-judge evaluation framework running test suites across every project, with pass-rate tracking and regression alerts.",
    tags: ["Evals", "LLM-as-judge", "Quality"],
    href: "/projects/eval-harness",
    status: "coming-soon",
  },
];
