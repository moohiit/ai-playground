import Link from "next/link";
import type { Metadata } from "next";
import { ExpenseApp } from "./ExpenseApp";

const PLAY_URL =
  "https://play.google.com/store/apps/details?id=com.moohiit.expensetracker";
const PAGE_URL = "https://aiplayground.mohitpatel.org/projects/expense-tracker";

export const metadata: Metadata = {
  title: "Splitzy AI — Expense Tracker, Bill Split & Budget App",
  description:
    "Splitzy AI is a free AI expense tracker: scan receipts, split group bills, track money you've lent, set budgets and savings goals. On the web and Android.",
  keywords: [
    "expense tracker",
    "AI expense tracker",
    "bill split app",
    "split expenses with friends",
    "receipt scanner app",
    "budget planner",
    "money lent tracker",
    "group expense manager",
    "Splitzy AI",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Splitzy AI — Expense Tracker, Bill Split & Budget App",
    description:
      "Scan receipts with AI, split bills with friends, track lent money, budgets and goals. Free on web and Android.",
    url: PAGE_URL,
    siteName: "Splitzy AI",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Splitzy AI — Expense Tracker & Bill Split",
    description:
      "AI receipt scanning, group bill splitting, budgets, goals and lent-money tracking — free on web and Android.",
  },
};

// Structured data so search engines understand this is an installable app and
// can surface the Play Store link alongside the web page.
const appJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Splitzy AI: Expense Tracker",
  operatingSystem: "ANDROID, WEB",
  applicationCategory: "FinanceApplication",
  description:
    "AI expense tracker with receipt scanning, group bill splitting, budgets, savings goals, and lent-money notes.",
  installUrl: PLAY_URL,
  url: PAGE_URL,
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
  author: { "@type": "Person", name: "Mohit Patel" },
};

export default function ExpenseTrackerPage() {
  return (
    <div className="relative flex flex-col gap-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
      <div className="pointer-events-none absolute inset-x-0 -top-20 -z-10 h-[380px] bg-grid bg-radial-fade opacity-70" />
      <div className="pointer-events-none absolute -top-16 left-1/4 -z-10 h-[320px] w-[320px] rounded-full bg-emerald-500/15 blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -top-10 right-10 -z-10 h-[280px] w-[280px] rounded-full bg-brand-500/15 blur-3xl animate-blob [animation-delay:-6s]" />

      <header className="flex flex-col gap-3 animate-fade-up">
        <Link
          href="/"
          className="group inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-brand-500"
        >
          <span className="transition-transform group-hover:-translate-x-1">←</span>
          Back to projects
        </Link>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-emerald-400/90 backdrop-blur">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 animate-pulse-ring" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          Vision · Groups · Reports
        </div>
        <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          <span className="text-gradient-brand">Splitzy AI</span> — Expense
          Tracker
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          Track personal expenses, split group bills fairly, scan receipts with
          AI, keep notes on money you&apos;ve lent, and stay on budget — on the
          web and Android.
        </p>
        <a
          href={PLAY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20"
        >
          ▶ Get Splitzy AI on Google Play
        </a>
      </header>

      <ExpenseApp />
    </div>
  );
}
