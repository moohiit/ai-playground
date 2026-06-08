"use client";

import { useState } from "react";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../lib/authContext";
import { Dashboard } from "./tabs/Dashboard";
import { GroupsTab } from "./tabs/GroupsTab";
import { AccountsTab } from "./tabs/AccountsTab";
import { BudgetsTab } from "./tabs/BudgetsTab";
import { RecurringTab } from "./tabs/RecurringTab";
import { CoachTab } from "./tabs/CoachTab";
import { ReportsTab } from "./tabs/ReportsTab";
import { SettingsTab } from "./tabs/SettingsTab";

const TABS = [
  { id: "Dashboard", icon: DashboardIcon },
  { id: "Accounts", icon: AccountsIcon },
  { id: "Budgets", icon: BudgetsIcon },
  { id: "Recurring", icon: RecurringIcon },
  { id: "Coach", icon: CoachIcon },
  { id: "Groups", icon: GroupsIcon },
  { id: "Reports", icon: ReportsIcon },
  { id: "Settings", icon: SettingsIcon },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function ExpenseApp() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("Dashboard");

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <p className="mb-5 text-sm text-zinc-300">
            Sign in to track your expenses, create groups, and view reports.
          </p>
          <a
            href={`/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03]"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            Sign in / Create account
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav className="relative flex gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1 backdrop-blur-sm">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all sm:flex-none",
              tab === id
                ? "bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
            )}
          >
            <Icon />
            <span>{id}</span>
          </button>
        ))}
      </nav>

      <div key={tab} className="animate-fade-up">
        {tab === "Dashboard" && <Dashboard />}
        {tab === "Accounts" && <AccountsTab />}
        {tab === "Budgets" && <BudgetsTab />}
        {tab === "Recurring" && <RecurringTab />}
        {tab === "Coach" && <CoachTab />}
        {tab === "Groups" && <GroupsTab />}
        {tab === "Reports" && <ReportsTab />}
        {tab === "Settings" && <SettingsTab />}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  );
}

function AccountsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function BudgetsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}

function RecurringIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 2.1 21 6l-4 3.9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 21.9 3 18l4-3.9" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function GroupsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
