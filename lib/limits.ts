export const PROJECT_SLUGS = [
  "resume-matcher",
  "sql-generator",
  "expense-tracker",
  "content-generator",
  "pdf-chat",
  "youtube-qa",
] as const;

export type ProjectSlug = (typeof PROJECT_SLUGS)[number];

export const DEFAULT_MONTHLY_REQUEST_LIMITS: Record<ProjectSlug, number> = {
  "resume-matcher": 50,
  "sql-generator": 100,
  "expense-tracker": 200,
  "content-generator": 30,
  "pdf-chat": 80,
  "youtube-qa": 80,
};

export const PROJECT_LABELS: Record<ProjectSlug, string> = {
  "resume-matcher": "Resume Matcher",
  "sql-generator": "SQL Generator",
  "expense-tracker": "Expense Tracker",
  "content-generator": "Content Generator",
  "pdf-chat": "PDF Chat",
  "youtube-qa": "YouTube Q&A",
};

export function isProjectSlug(value: string): value is ProjectSlug {
  return (PROJECT_SLUGS as readonly string[]).includes(value);
}

export function getMonthlyLimit(
  slug: ProjectSlug,
  overrides?: Map<string, number> | Record<string, number> | null
): number {
  if (overrides) {
    const override =
      overrides instanceof Map ? overrides.get(slug) : overrides[slug];
    if (typeof override === "number" && override >= 0) return override;
  }
  return DEFAULT_MONTHLY_REQUEST_LIMITS[slug];
}

export function currentMonthRange(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );
  return { start, end };
}
