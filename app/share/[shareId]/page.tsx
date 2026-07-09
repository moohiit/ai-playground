"use client";

// PUBLIC, no-auth share page. Lives at the top level (outside /projects, which
// is wrapped by AuthGate) so anyone with the link — including non-users — can
// open it without signing in. Mirrors the in-app group "Settle Up" tab:
// hero total, who-pays-whom plan, and the full paid/share/net calculation.
import { useEffect, useState } from "react";
import { formatMoney } from "../../../modules/expense-tracker/currencies";

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
        if (!r.ok)
          throw new Error(
            (await r.json().catch(() => ({}))).error ?? "Link not found"
          );
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Link not found"));
  }, [params.shareId]);

  const cur = data?.currency ?? "INR";
  const money = (n: number) => formatMoney(n, cur);
  // Signed net, formatted like the app: "+₹4,660.66" / "−₹1,669.34".
  const signedNet = (n: number) =>
    `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;

  return (
    // Full-bleed on phones (no side margins); centered card column on larger
    // screens.
    <main className="min-h-screen bg-[#05060a] px-0 py-6 text-zinc-100 sm:px-4 sm:py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-5 px-3 text-center sm:px-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-brand-500/90">
            Shared bill split
          </div>
          <h1 className="mt-1 text-xl font-bold sm:text-2xl">{data?.groupName ?? "Group"}</h1>
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
          <div className="flex flex-col gap-3 sm:gap-5">
            {/* Hero total */}
            <div className="border-y border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-4 text-center sm:rounded-2xl sm:border sm:p-5">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                Active total
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
                {money(data.total)}
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {data.expenseCount} unsettled{" "}
                {data.expenseCount === 1 ? "expense" : "expenses"}
              </div>
            </div>

            {/* Settle up — who pays whom */}
            {data.settlements.length > 0 ? (
              <div className="border-y border-amber-500/30 bg-amber-500/[0.05] p-3 sm:rounded-2xl sm:border sm:p-5">
                <div className="mb-2 text-[13px] font-semibold text-amber-300">
                  Settle up
                </div>
                <div className="flex flex-col gap-1.5">
                  {data.settlements.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-2.5 py-2"
                    >
                      {/* Inline spans so long names WRAP by word instead of
                          truncating to "Deepmala P… → Nirde…" on phones. */}
                      <div className="min-w-0 flex-1 text-[13px] leading-snug">
                        <span className="font-medium text-red-300">{s.from}</span>
                        <span className="text-zinc-600"> → </span>
                        <span className="font-medium text-emerald-300">{s.to}</span>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums">
                        {money(s.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  Settles everyone with the fewest possible transfers.
                </p>
              </div>
            ) : (
              <div className="border-y border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-center text-[13px] text-emerald-300 sm:rounded-2xl sm:border">
                All settled — nobody owes anything. 🎉
              </div>
            )}

            {/* How it's calculated */}
            <div className="border-y border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-3 sm:rounded-2xl sm:border sm:p-5">
              <div className="mb-2 text-[13px] font-semibold">How it’s calculated</div>
              {/* Full-width grid; money cells never wrap. */}
              <div className="overflow-x-auto rounded-lg border border-zinc-800/70">
                <div className="min-w-[300px]">
                  <div className="grid grid-cols-[minmax(64px,1.2fr)_1fr_1fr_1.1fr] gap-x-1.5 border-b border-zinc-800/70 bg-zinc-900/50 px-2 py-1.5 text-[9px] uppercase tracking-wider text-zinc-500">
                    <span>Member</span>
                    <span className="text-right">Paid</span>
                    <span className="text-right">Share</span>
                    <span className="text-right">Net</span>
                  </div>
                  {data.members.map((m, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[minmax(64px,1.2fr)_1fr_1fr_1.1fr] items-center gap-x-1.5 px-2 py-1.5 text-[10.5px] tabular-nums odd:bg-white/[0.015]"
                    >
                      <span className="truncate text-zinc-200">{m.name}</span>
                      <span className="whitespace-nowrap text-right text-zinc-400">{money(m.paid)}</span>
                      <span className="whitespace-nowrap text-right text-zinc-400">{money(m.owed)}</span>
                      <span
                        className={`whitespace-nowrap text-right font-semibold ${
                          m.net > 0
                            ? "text-emerald-400"
                            : m.net < 0
                            ? "text-red-400"
                            : "text-zinc-500"
                        }`}
                      >
                        {signedNet(m.net)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                Net = Paid − Share. Positive → the group owes them; negative →
                they owe the group.
              </p>
            </div>

            <p className="px-3 text-center text-[10px] text-zinc-600 sm:px-0">
              Read-only view · powered by Splitzy AI
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
