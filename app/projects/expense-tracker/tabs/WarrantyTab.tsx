"use client";

import { useCallback, useEffect, useState } from "react";
import { cn, localISODate } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";

type WarrantyEntry = {
  _id: string;
  label: string;
  purchaseDate: string;
  returnByDate: string | null;
  warrantyExpiresAt: string | null;
  notes: string;
  expenseId: string | null;
  daysUntilReturn: number | null;
  daysUntilWarranty: number | null;
  returnStatus: "active" | "return-soon" | "missed-return" | null;
  warrantyStatus: "active" | "warranty-soon" | "warranty-expired" | null;
};

type ReceiptExpense = {
  _id: string;
  description: string;
  date: string;
  itemCount: number;
  itemNames: string[];
};

const EMPTY: Omit<
  WarrantyEntry,
  "_id" | "daysUntilReturn" | "daysUntilWarranty" | "returnStatus" | "warrantyStatus"
> = {
  label: "",
  purchaseDate: localISODate(),
  returnByDate: null,
  warrantyExpiresAt: null,
  notes: "",
  expenseId: null,
};

const inputCls =
  "w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none";

export function WarrantyTab() {
  const { authFetch } = useAuth();
  const [items, setItems] = useState<WarrantyEntry[]>([]);
  const [receipts, setReceipts] = useState<ReceiptExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const load = useCallback(async () => {
    try {
      const [wRes, rRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/warranty"),
        authFetch("/api/projects/expense-tracker/warranty?receipts=1"),
      ]);
      const wData = await wRes.json().catch(() => ({}));
      const rData = await rRes.json().catch(() => ({}));
      setItems(wData.warranties ?? []);
      setReceipts(rData.expenses ?? []);
    } catch {
      // network failure — keep last list
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const [savingAdd, setSavingAdd] = useState(false);

  async function handleAdd() {
    if (savingAdd) return;
    if (!form.label.trim() || !form.purchaseDate) return;
    setSavingAdd(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/warranty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim(),
          purchaseDate: form.purchaseDate,
          returnByDate: form.returnByDate || null,
          warrantyExpiresAt: form.warrantyExpiresAt || null,
          notes: form.notes,
          expenseId: form.expenseId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to save");
        return; // keep the form open so nothing typed is lost
      }
      setForm({ ...EMPTY });
      setShowAdd(false);
      load();
    } catch {
      alert("Network error — the item was not saved.");
    } finally {
      setSavingAdd(false);
    }
  }

  async function handleImport(expenseId: string) {
    if (importingId) return;
    setImportingId(expenseId);
    const res = await authFetch(
      "/api/projects/expense-tracker/warranty/from-expense",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId }),
      }
    );
    const data = await res.json().catch(() => ({}));
    setImportingId(null);
    if (res.ok) {
      alert(`Imported ${data.created} item(s)${data.skipped ? ` (${data.skipped} already tracked)` : ""}`);
      setShowImport(false);
      load();
    } else {
      alert(data.error ?? "Import failed");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this entry?")) return;
    await authFetch(`/api/projects/expense-tracker/warranty/${id}`, {
      method: "DELETE",
    });
    load();
  }

  const needsAttention = items.filter(
    (w) =>
      w.returnStatus === "return-soon" ||
      w.returnStatus === "missed-return" ||
      w.warrantyStatus === "warranty-soon" ||
      w.warrantyStatus === "warranty-expired"
  );
  const rest = items.filter((w) => !needsAttention.includes(w));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">
            Warranties & Returns
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Track return windows and warranty periods for your purchases.
          </p>
        </div>
        <div className="flex gap-2">
          {receipts.length > 0 && (
            <button
              onClick={() => setShowImport((v) => !v)}
              className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              📥 From receipt
            </button>
          )}
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg border border-brand-500/40 bg-brand-500/15 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-500/25"
          >
            + Add item
          </button>
        </div>
      </div>

      {/* Import from receipt panel */}
      {showImport && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/50 p-4">
          <p className="mb-3 text-sm font-medium text-zinc-300">
            Recent scanned receipts — click to import all line items:
          </p>
          <div className="flex flex-col gap-2">
            {receipts.map((r) => (
              <div
                key={r._id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    {r.description}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {new Date(r.date).toLocaleDateString()} ·{" "}
                    {r.itemNames.join(", ")}
                  </p>
                </div>
                <button
                  onClick={() => handleImport(r._id)}
                  disabled={importingId === r._id}
                  className="shrink-0 rounded-lg border border-brand-500/40 bg-brand-500/15 px-3 py-1.5 text-xs font-semibold text-brand-300 hover:bg-brand-500/25 disabled:opacity-50"
                >
                  {importingId === r._id ? "…" : `Import ${r.itemCount}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/50 p-5">
          <h3 className="mb-4 text-sm font-semibold text-zinc-200">
            New warranty entry
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item name *">
              <input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. iPhone case, Laptop"
                className={inputCls}
              />
            </Field>
            <Field label="Purchase date *">
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, purchaseDate: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Return by (optional)">
              <input
                type="date"
                value={form.returnByDate ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    returnByDate: e.target.value || null,
                  }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Warranty expires (optional)">
              <input
                type="date"
                value={form.warrantyExpiresAt ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    warrantyExpiresAt: e.target.value || null,
                  }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Store, serial number, etc."
                className={inputCls}
              />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!form.label.trim()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setForm({ ...EMPTY });
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700/60 py-12 text-center">
          <p className="text-4xl">🛡️</p>
          <p className="mt-3 text-sm text-zinc-400">No warranty entries yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Add items manually or import from a scanned receipt.
          </p>
        </div>
      ) : (
        <>
          {needsAttention.length > 0 && (
            <Section title="Needs attention">
              {needsAttention.map((w) => (
                <WarrantyCard key={w._id} w={w} onDelete={() => remove(w._id)} />
              ))}
            </Section>
          )}
          {rest.length > 0 && (
            <Section title={needsAttention.length > 0 ? "All active" : undefined}>
              {rest.map((w) => (
                <WarrantyCard key={w._id} w={w} onDelete={() => remove(w._id)} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {title && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {title}
        </p>
      )}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function WarrantyCard({
  w,
  onDelete,
}: {
  w: WarrantyEntry;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-zinc-100">{w.label}</p>
          <p className="text-xs text-zinc-500">
            Purchased {new Date(w.purchaseDate).toLocaleDateString()}
            {w.notes ? ` · ${w.notes}` : ""}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 text-xs text-zinc-600 hover:text-red-400"
        >
          Delete
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {w.returnByDate && (
          <Badge
            label="Return by"
            date={w.returnByDate}
            days={w.daysUntilReturn}
            status={w.returnStatus}
          />
        )}
        {w.warrantyExpiresAt && (
          <Badge
            label="Warranty"
            date={w.warrantyExpiresAt}
            days={w.daysUntilWarranty}
            status={w.warrantyStatus}
          />
        )}
        {!w.returnByDate && !w.warrantyExpiresAt && (
          <span className="rounded-full border border-zinc-700/50 bg-zinc-800/50 px-2.5 py-0.5 text-xs text-zinc-500">
            No dates set
          </span>
        )}
      </div>
    </div>
  );
}

function Badge({
  label,
  date,
  days,
  status,
}: {
  label: string;
  date: string;
  days: number | null;
  status: string | null;
}) {
  const colors =
    status === "missed-return" || status === "warranty-expired"
      ? "border-red-500/40 bg-red-500/10 text-red-400"
      : status === "return-soon" || status === "warranty-soon"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
      : "border-emerald-500/30 bg-emerald-500/8 text-emerald-400";

  const countdown =
    days === null
      ? ""
      : days < 0
      ? ` · expired ${Math.abs(days)}d ago`
      : days === 0
      ? " · today!"
      : ` · ${days}d left`;

  return (
    <span
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-xs font-medium",
        colors
      )}
    >
      {label}: {new Date(date).toLocaleDateString()}{countdown}
    </span>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}
