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
];
