import { ExpenseApp } from "./ExpenseApp";

export const metadata = {
  title: "Expense Tracker · AI Playground",
  description:
    "Track personal and group expenses with receipt scanning, smart splitting, and monthly reports.",
};

export default function ExpenseTrackerPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to projects
        </a>
        <h1 className="text-3xl font-bold tracking-tight">Expense Tracker</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Track personal expenses, manage group bills with smart splitting, scan
          receipts with Gemini Vision, and view detailed reports.
        </p>
      </header>
      <ExpenseApp />
    </div>
  );
}
