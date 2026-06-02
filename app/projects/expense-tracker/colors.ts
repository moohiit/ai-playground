// Deterministic colors per expense category — color-codes chips, charts and
// accents across the web expense-tracker UI. Mirrors mobile/lib/colors.ts.
const CATEGORY_COLORS: Record<string, string> = {
  "Food & Groceries": "#34d399",
  "Rent & Housing": "#818cf8",
  Utilities: "#22d3ee",
  Transport: "#fbbf24",
  Shopping: "#f472b6",
  "Cosmetics & Personal Care": "#c084fc",
  Entertainment: "#fb923c",
  Health: "#f87171",
  Education: "#2dd4bf",
  Subscriptions: "#a78bfa",
  Other: "#94a3b8",
};

const FALLBACK = [
  "#818cf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa",
  "#f472b6", "#22d3ee", "#fb923c", "#2dd4bf", "#c084fc",
];

export function categoryColor(category: string): string {
  const known = CATEGORY_COLORS[category];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < category.length; i++) h += category.charCodeAt(i);
  return FALLBACK[h % FALLBACK.length];
}
