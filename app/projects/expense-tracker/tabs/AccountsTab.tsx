"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { formatMoney } from "../../../../modules/expense-tracker/currencies";

type Account = {
  _id: string;
  name: string;
  kind: "cash" | "bank" | "card" | "wallet";
  currency: string;
  openingBalance: number;
  balance: number;
  archived: boolean;
};

const KINDS: { id: Account["kind"]; label: string; icon: string }[] = [
  { id: "bank", label: "Bank", icon: "🏦" },
  { id: "cash", label: "Cash", icon: "💵" },
  { id: "card", label: "Card", icon: "💳" },
  { id: "wallet", label: "Wallet", icon: "👛" },
];

const kindMeta = (k: string) => KINDS.find((x) => x.id === k) ?? KINDS[0];

export function AccountsTab() {
  const { authFetch } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [base, setBase] = useState("INR");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const load = useCallback(async () => {
    const res = await authFetch("/api/projects/expense-tracker/accounts");
    const data = await res.json().catch(() => ({}));
    setAccounts(data.accounts ?? []);
    setLoading(false);
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setBase(d.prefs.baseCurrency))
      .catch(() => {});
  }, [authFetch]);

  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  async function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Delete "${name}"? Its transactions stay but become unassigned, and its transfers are removed.`
      )
    )
      return;
    await authFetch(`/api/projects/expense-tracker/accounts/${id}`, {
      method: "DELETE",
    });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Net worth"
          value={formatMoney(netWorth, base)}
          hint={`${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`}
          accent={netWorth < 0 ? "from-red-500/40" : "from-emerald-500/40"}
        />
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center justify-between rounded-xl border border-brand-500/40 bg-gradient-to-br from-brand-600/30 to-fuchsia-500/20 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-500"
        >
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-300">Account</div>
            <div className="mt-1 text-lg font-semibold text-white">+ Add account</div>
          </div>
        </button>
        <button
          onClick={() => setShowTransfer((v) => !v)}
          disabled={accounts.length < 2}
          className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900/40 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-400">Move money</div>
            <div className="mt-1 text-lg font-semibold text-zinc-100">⇄ Transfer</div>
          </div>
        </button>
      </div>

      {showAdd && (
        <AddAccountForm
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {showTransfer && accounts.length >= 2 && (
        <TransferForm
          accounts={accounts}
          base={base}
          onClose={() => setShowTransfer(false)}
          onSaved={() => {
            setShowTransfer(false);
            load();
          }}
        />
      )}

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-12 text-center text-sm text-zinc-400">
          No accounts yet. Add a bank, cash, card, or wallet to track balances.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => {
            const meta = kindMeta(a.kind);
            return (
              <div
                key={a._id}
                className="group relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{meta.icon}</span>
                    <div>
                      <div className="font-semibold text-zinc-100">{a.name}</div>
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                        {meta.label}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(a._id, a.name)}
                    className="text-xs text-zinc-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    Delete
                  </button>
                </div>
                <div
                  className={cn(
                    "mt-4 font-mono text-2xl font-bold tabular-nums",
                    a.balance < 0 ? "text-red-400" : "text-zinc-100"
                  )}
                >
                  {formatMoney(a.balance, base)}
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  opening {formatMoney(a.openingBalance, base)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddAccountForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Account["kind"]>("bank");
  const [opening, setOpening] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setError("Enter an account name");
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/projects/expense-tracker/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          kind,
          openingBalance: parseFloat(opening) || 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Failed to add account");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add account");
      setSaving(false);
    }
  }

  return (
    <FormCard title="Add account" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HDFC Savings"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
        </Labeled>
        <Labeled label="Opening balance">
          <input
            type="number"
            step="0.01"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
          />
        </Labeled>
      </div>
      <Labeled label="Type">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
                kind === k.id
                  ? "border-brand-500/60 bg-brand-500/15 text-brand-400"
                  : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600"
              )}
            >
              {k.icon} {k.label}
            </button>
          ))}
        </div>
      </Labeled>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <FormActions saving={saving} onClose={onClose} onSubmit={submit} label="Add account" />
    </FormCard>
  );
}

function TransferForm({
  accounts,
  base,
  onClose,
  onSaved,
}: {
  accounts: Account[];
  base: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [from, setFrom] = useState(accounts[0]?._id ?? "");
  const [to, setTo] = useState(accounts[1]?._id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (from === to) return setError("Pick two different accounts");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/projects/expense-tracker/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId: from, toAccountId: to, amount: amt, date, note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Transfer failed");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
      setSaving(false);
    }
  }

  return (
    <FormCard title={`Transfer (${base})`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="From">
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
          >
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} ({formatMoney(a.balance, base)})
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="To">
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
          >
            {accounts.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} ({formatMoney(a.balance, base)})
              </option>
            ))}
          </select>
        </Labeled>
        <Labeled label="Amount">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
          />
        </Labeled>
        <Labeled label="Date">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 focus:border-brand-500 focus:outline-none"
          />
        </Labeled>
      </div>
      <Labeled label="Note (optional)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Credit card payment"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
        />
      </Labeled>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <FormActions saving={saving} onClose={onClose} onSubmit={submit} label="Transfer" />
    </FormCard>
  );
}

function FormCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent" />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-200">
          Close
        </button>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function FormActions({
  saving,
  onClose,
  onSubmit,
  label,
}: {
  saving: boolean;
  onClose: () => void;
  onSubmit: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        onClick={onClose}
        className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={saving}
        className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5">
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent", accent ?? "from-brand-500/40")} />
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-100">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
