"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "../../../../../modules/expense-tracker/currencies";

type Shared = {
  groupName: string;
  currency: string;
  expenseCount: number;
  total: number;
  members: { name: string; paid: number; owed: number; net: number }[];
  settlements: { from: string; to: string; amount: number }[];
};

export default function SharePage({ params }: { params: { shareId: string } }) {
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/expense-tracker/share/${params.shareId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Link not found");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Link not found"));
  }, [params.shareId]);

  return (
    <main className="min-h-screen bg-[#05060a] px-4 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand-500/90">Shared bill split</div>
          <h1 className="mt-1 text-2xl font-bold">{data?.groupName ?? "Group"}</h1>
        </div>

        {error ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-10 text-center text-sm text-zinc-400">
            {error}. This link may have been turned off.
          </div>
        ) : !data ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-10 text-center text-sm text-zinc-500">
            Loading…
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 text-center">
              <div className="text-[11px] uppercase tracking-wider text-zinc-500">Active total</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(data.total, data.currency)}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{data.expenseCount} unsettled expenses</div>
            </div>

            {data.settlements.length > 0 ? (
              <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
                <div className="mb-3 text-sm font-semibold">Who pays whom</div>
                <div className="flex flex-col gap-2">
                  {data.settlements.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                      <span className="text-zinc-300">
                        <span className="font-medium text-red-300">{s.from}</span> → <span className="font-medium text-emerald-300">{s.to}</span>
                      </span>
                      <span className="font-mono font-semibold tabular-nums">{formatMoney(s.amount, data.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5 text-center text-sm text-emerald-300">
                All settled — nobody owes anything. 🎉
              </div>
            )}

            <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
              <div className="mb-3 text-sm font-semibold">Balances</div>
              <div className="flex flex-col gap-2">
                {data.members.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-300">{m.name}</span>
                    <span className={m.net > 0 ? "text-emerald-400" : m.net < 0 ? "text-red-400" : "text-zinc-500"}>
                      {m.net > 0 ? "gets back " : m.net < 0 ? "owes " : "settled "}
                      {m.net !== 0 && formatMoney(Math.abs(m.net), data.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-center text-[11px] text-zinc-600">
              Read-only view · powered by Expense Tracker
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
