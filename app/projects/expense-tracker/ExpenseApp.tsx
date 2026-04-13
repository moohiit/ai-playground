"use client";

import { useState } from "react";
import { cn } from "../../../lib/utils";
import { useAuth } from "../../../lib/authContext";
import { Dashboard } from "./tabs/Dashboard";
import { GroupsTab } from "./tabs/GroupsTab";
import { ReportsTab } from "./tabs/ReportsTab";

const TABS = ["Dashboard", "Groups", "Reports"] as const;
type Tab = (typeof TABS)[number];

export function ExpenseApp() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("Dashboard");

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading...</p>;
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
        <p className="mb-4 text-sm text-zinc-400">
          Sign in to track your expenses, create groups, and view reports.
        </p>
        <a
          href={`/login?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/")}`}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
        >
          Sign in / Create account
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition",
              tab === t
                ? "bg-brand-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Dashboard" && <Dashboard />}
      {tab === "Groups" && <GroupsTab />}
      {tab === "Reports" && <ReportsTab />}
    </div>
  );
}
