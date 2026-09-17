"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { cn, formatDay } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";
import { formatMoney } from "../../../../modules/expense-tracker/currencies";
import { AddExpenseModal } from "./AddExpenseModal";
import { GroupReport } from "./GroupReport";
import { GroupSettingsModal } from "./GroupSettingsModal";
import { getBaseCurrency } from "../prefs";
import type { PairBalance } from "../types";
import type { KnownPerson } from "../types";
import type { SplitMode } from "../../../../modules/expense-tracker/balance";
import { SPLIT_LABEL } from "../splits";
import { showAlert, confirmDialog } from "../dialog";

// Groups are single-currency in practice (v1); format amounts with the
// currency most of the group's expenses were entered in, instead of a
// hardcoded ₹ that mislabels non-INR groups.
function dominantCurrency(expenses: { currency?: string }[]): string {
  const counts = new Map<string, number>();
  for (const e of expenses) {
    const c = e.currency ?? "INR";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "INR";
}

type Member = {
  userId: string;
  email: string;
  name: string;
  isActive: boolean;
  isGuest?: boolean;
  // Per-member notification preference for this group.
  muted?: boolean;
};
type Group = {
  _id: string;
  name: string;
  description: string;
  createdBy: string;
  members: Member[];
  shareId?: string | null;
  // Members who asked the creator to delete the group (only the creator can).
  deleteRequests?: { userId: string; name: string; requestedAt: string }[];
};
type Balance = {
  memberId: string;
  name: string;
  totalPaid: number;
  totalOwed: number;
  netBalance: number;
};
type Settlement = {
  from: { id: string; name: string };
  to: { id: string; name: string };
  amount: number;
  // When the creditor last nudged the debtor about this transfer; null/absent
  // if never. Reminders are rate-limited to one per 24h server-side.
  remindedAt?: string | null;
};
type Expense = {
  _id: string;
  splitMode?: SplitMode;
  paidBy: { id: string; name: string };
  amount: number;
  currency?: string;
  // Amount frozen in base currency at write time; absent on pre-multi-currency
  // rows, which fall back to `amount`.
  amountBase?: number;
  description: string;
  category: string;
  date: string;
  splitAmong: { memberId: string; name: string }[];
  splits: { memberId: string; name: string; amount: number }[];
  isSettlement?: boolean;
};
type SettlementTransfer = {
  from: { id: string; name: string };
  to: { id: string; name: string };
  amount: number;
  paidAt: string;
};
type SettlementRecord = {
  settlementId: string;
  settledAt: string;
  expenses: Expense[];
  // Settle-up payments actually made before the batch closed. Empty for
  // batches closed with no individual payments, and for pre-existing batches
  // recorded before settlements were tracked — both fall back to the plan
  // recomputed from Paid − Share.
  transfers?: SettlementTransfer[];
};

type Tab = "active" | "history" | "report";
type Props = { groupId: string; onBack: () => void };

const PAGE_SIZE = 10;

export function GroupDetail({ groupId, onBack }: Props) {
  const { authFetch, user } = useAuth();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [activeAmount, setActiveAmount] = useState(0);
  const [activeMine, setActiveMine] = useState(0);
  // Quick toggle on the Active tab: only rows I carry a share of.
  const [onlyMine, setOnlyMine] = useState(false);
  // Pairwise view: the expenses two members share, and what that leaves
  // between them specifically.
  const [pairA, setPairA] = useState<string | null>(null);
  const [pairB, setPairB] = useState<string | null>(null);
  const [pair, setPair] = useState<PairBalance | null>(null);
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [page, setPage] = useState(1);
  const [settlementHistory, setSettlementHistory] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [tab, setTab] = useState<Tab>("active");
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [newMember, setNewMember] = useState("");
  // People already sharing a group with you — so adding a flatmate is a click
  // rather than typing their address again.
  const [people, setPeople] = useState<KnownPerson[]>([]);
  // Suggestions belong to the invite field, so they appear while it has focus
  // and get out of the way otherwise.
  const [memberFocused, setMemberFocused] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [newGuest, setNewGuest] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Group settings modal: rename, members, mute, share link, delete.
  const [showSettings, setShowSettings] = useState(false);

  const shareUrl =
    typeof window !== "undefined" && shareId
      ? `${window.location.origin}/share/${shareId}`
      : "";

  const [shareBusy, setShareBusy] = useState(false);

  const cur = dominantCurrency(expenses);
  const money = (n: number) => formatMoney(n, cur);
  // Balances, the settle-up plan and the Active/my-share totals are all
  // base-currency figures (calculateBalances works on amountBase); only the
  // expense rows themselves carry an entry-currency amount. Labelling the
  // former with the group's entry currency showed a base number under a
  // foreign symbol.
  const baseMoney = (n: number) => formatMoney(n, baseCurrency);
  // With a pair selected the list narrows to what those two share; otherwise
  // it is the group's active window as before.
  const visibleExpenses = pair ? pair.expenses : expenses;

  // Matching on name and address, because people search for whichever they
  // remember. Capped so the list never pushes the form off-screen.
  const suggestions = useMemo(() => {
    const q = newMember.trim().toLowerCase();
    const pool = q
      ? people.filter(
          (p) =>
            p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        )
      : people;
    return pool.slice(0, 6);
  }, [people, newMember]);

  async function toggleShare() {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      if (shareId) {
        const res = await authFetch(`/api/projects/expense-tracker/groups/${groupId}/share`, { method: "DELETE" });
        // Only report sharing as off if the server actually revoked it —
        // otherwise the UI would say "off" while the public link still works.
        if (!res.ok) {
          showAlert("Couldn't turn off sharing — try again.");
          return;
        }
        setShareId(null);
        return;
      }
      const res = await authFetch(`/api/projects/expense-tracker/groups/${groupId}/share`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (data.shareId) {
        setShareId(data.shareId);
      } else {
        showAlert("Couldn't create the share link — try again.");
      }
    } catch {
      showAlert("Network error — sharing was not changed.");
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  // Only the latest in-flight fetch may write state (rapid pagination
  // clicks fire overlapping requests; a slow early page could win).
  const fetchSeqRef = useRef(0);

  const fetchAll = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    // try/finally so a network error or non-JSON response can't strand the
    // "Loading group..." spinner forever (setLoading(false) always runs).
    try {
      const [gRes, bRes, eRes, sRes] = await Promise.all([
        authFetch(`/api/projects/expense-tracker/groups/${groupId}`),
        authFetch(`/api/projects/expense-tracker/reports/balances/${groupId}`),
        authFetch(
          // includeSettlements: this screen shows settle-up payments as their
          // own badged rows with an Undo action, unlike the global list.
          `/api/projects/expense-tracker/expenses?groupId=${groupId}&limit=${PAGE_SIZE}&page=${page}&settled=false&includeSettlements=true${
            onlyMine ? "&mine=true" : ""
          }`
        ),
        authFetch(
          `/api/projects/expense-tracker/reports/summary?groupId=${groupId}&settled=false${
            onlyMine ? "&mine=true" : ""
          }`
        ),
      ]);
      const [gData, bData, eData, sData] = await Promise.all([
        gRes.json().catch(() => ({})),
        bRes.json().catch(() => ({})),
        eRes.json().catch(() => ({})),
        sRes.json().catch(() => ({})),
      ]);
      if (seq !== fetchSeqRef.current) return; // superseded by a newer fetch
      setGroup(gData.group ?? null);
      setPairA((prev) => prev ?? user?.userId ?? null);
      setShareId(gData.group?.shareId ?? null);
      setBalances(bData.balances ?? []);
      setSettlements(bData.settlements ?? []);
      setExpenses(eData.expenses ?? []);
      setExpenseTotal(eData.total ?? 0);
      setActiveAmount(sData.totalAmount ?? 0);
      setActiveMine(sData.myShare ?? 0);
      setBaseCurrency(await getBaseCurrency(authFetch));

      const pRes = await authFetch(
        `/api/projects/expense-tracker/people?excludeGroupId=${groupId}`
      );
      if (pRes.ok) {
        const pData = await pRes.json().catch(() => ({}));
        setPeople(pData.people ?? []);
      }
    } catch {
      if (seq === fetchSeqRef.current) setGroup(null); // "not found / failed" state
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [groupId, page, onlyMine]);

  // A deep page can vanish when the filter narrows the list — go back to 1.
  useEffect(() => {
    setPage(1);
  }, [onlyMine]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/history`
      );
      const data = await res.json().catch(() => ({}));
      setSettlementHistory(data.history ?? []);
    } catch {
      // keep whatever history we had; the tab shows its empty state otherwise
    }
  }, [groupId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  async function handleAddMember() {
    if (addingMember) return;
    if (!newMember.trim()) return;
    setAddingMember(true);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newMember.trim() }),
      });
      if (!res.ok) {
        // Most common failure: the email isn't registered. Keep the input so
        // the user can correct it instead of silently pretending success.
        const data = await res.json().catch(() => ({}));
        showAlert(data.error ?? "Couldn't send the invite");
        return;
      }
      showAlert(
        `Invite sent to ${newMember.trim()} — they'll join once they accept it.`
      );
      setNewMember("");
      fetchAll();
    } catch {
      showAlert("Network error — invite not sent.");
    } finally {
      setAddingMember(false);
    }
  }

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  async function handleRemoveMember(m: Member) {
    if (removingMemberId) return;
    if (
      !await confirmDialog(
        `Remove ${m.name} from the group?\n\nTheir past expenses and balances stay recorded — if they have any, they'll be marked as "left" and excluded from new expenses. Re-adding them brings them back.`
      )
    )
      return;
    setRemovingMemberId(m.userId);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/members?memberId=${encodeURIComponent(m.userId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showAlert(data.error ?? "Couldn't remove member");
        return;
      }
      fetchAll();
    } catch {
      showAlert("Network error — member not removed.");
    } finally {
      setRemovingMemberId(null);
    }
  }

  async function handleAddGuest() {
    if (addingGuest) return;
    const name = newGuest.trim();
    if (!name) return;
    setAddingGuest(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/guests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add guest");
      setNewGuest("");
      fetchAll();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : "Failed to add guest");
    } finally {
      setAddingGuest(false);
    }
  }

  const [reopening, setReopening] = useState(false);

  async function confirmReopen(rec: SettlementRecord) {
    const count = rec.expenses.length;
    const total = rec.expenses.reduce(
      (sum, e) => sum + (e.amountBase ?? e.amount),
      0
    );
    const payments = rec.transfers?.length ?? 0;
    if (
      !await confirmDialog(
        `Reopen this settlement?\n\n${count} ${
          count === 1 ? "expense" : "expenses"
        } worth ${formatMoney(total, baseCurrency)} go back to Active, and the ` +
          `settle-up payments recorded at the time are restored.` +
          (payments > 0
            ? `\n\n${payments} payment${payments === 1 ? "" : "s"} will reappear as settlement rows.`
            : "") +
          `\n\nEveryone in the group is notified.`
      )
    )
      return;
    setReopening(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/reopen`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(data.error ?? "Couldn't reopen that settlement");
        return;
      }
      setTab("active");
      await fetchAll();
    } catch {
      showAlert("Network error — nothing was reopened.");
    } finally {
      setReopening(false);
    }
  }

  // Fetch the pair whenever both ends are chosen. Server-side because the
  // list here is paginated and the answer must cover the whole group.
  useEffect(() => {
    if (!pairA || !pairB || pairA === pairB) {
      setPair(null);
      return;
    }
    let cancelled = false;
    authFetch(
      `/api/projects/expense-tracker/groups/${groupId}/between?a=${pairA}&b=${pairB}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.net === "number") setPair(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authFetch, groupId, pairA, pairB]);

  /** First click picks one end, the next picks the other; clicking a chosen
   *  member releases that end so it can be reassigned. */
  function selectPairMember(id: string) {
    if (pairA === id) return setPairA(null);
    if (pairB === id) return setPairB(null);
    if (!pairA) return setPairA(id);
    setPairB(id);
  }

  async function handleDeleteExpense(id: string) {
    if (!await confirmDialog("Delete this expense?")) return;
    const res = await authFetch(`/api/projects/expense-tracker/expenses/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showAlert(data.error ?? "Couldn't delete that expense");
      return;
    }
    // Removing the last row on a page leaves the user stranded on an empty
    // page whose pagination control is itself hidden. Step back first; the
    // page change refetches, so don't also call fetchAll.
    if (expenses.length === 1 && page > 1) setPage((p) => p - 1);
    else fetchAll();
  }

  async function handleDeleteGroup() {
    if (!await confirmDialog("Delete this group and all its expenses? This cannot be undone."))
      return;
    const res = await authFetch(`/api/projects/expense-tracker/groups/${groupId}`, {
      method: "DELETE",
    });
    // Only the creator may delete a group. Navigating back regardless made a
    // refused delete look like it had worked, until the group reappeared.
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showAlert(data.error ?? "Couldn't delete this group");
      return;
    }
    onBack();
  }

  /** Resolves true once the server accepted the name, so the settings modal
   *  knows whether to leave its edit field open. */
  async function renameGroup(rawName: string): Promise<boolean> {
    if (!group) return false;
    const name = rawName.trim();
    if (!name || name === group.name) return false;
    try {
      const res = await authFetch(`/api/projects/expense-tracker/groups/${groupId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showAlert(data.error ?? "Couldn't rename the group");
        return false;
      }
      // Reflect the new name at once; the refetch below confirms it.
      setGroup((g) => (g ? { ...g, name } : g));
      fetchAll();
      return true;
    } catch {
      showAlert("Network error — group not renamed.");
      return false;
    }
  }

  // The pencil opens Settings, where renaming is an inline field. It used to
  // call the browser's prompt(), the last system dialog left in the app.
  function handleRenameGroup() {
    if (group) setShowSettings(true);
  }

  const [deleteRequestBusy, setDeleteRequestBusy] = useState(false);
  const creatorName =
    group?.members.find((m) => m.userId === group?.createdBy)?.name ?? "the creator";

  /** A non-creator cannot delete the group; they can ask the creator to. */
  async function handleRequestDelete() {
    if (deleteRequestBusy) return;
    if (
      !await confirmDialog(
        `Ask ${creatorName} to delete this group?\n\nOnly they can delete it. They'll get a notification with your request.`,
        { title: "Request deletion", confirmText: "Send request" }
      )
    )
      return;
    setDeleteRequestBusy(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/delete-request`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(data.error ?? `Couldn't send the request (HTTP ${res.status})`);
        return;
      }
      showAlert(`${creatorName} has been notified.`, "Request sent");
      fetchAll();
    } catch {
      showAlert("Network error — request not sent.");
    } finally {
      setDeleteRequestBusy(false);
    }
  }

  /** Same endpoint for both roles: a member withdraws their own request, the
   *  creator dismisses every pending one. */
  async function handleClearDeleteRequests() {
    if (deleteRequestBusy) return;
    const isCreator = user?.userId === group?.createdBy;
    setDeleteRequestBusy(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/delete-request`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(
          data.error ??
            `Couldn't ${isCreator ? "dismiss the requests" : "withdraw the request"} (HTTP ${res.status})`
        );
        return;
      }
      fetchAll();
    } catch {
      showAlert(
        isCreator
          ? "Network error — requests not dismissed."
          : "Network error — request not withdrawn."
      );
    } finally {
      setDeleteRequestBusy(false);
    }
  }

  const [payingKey, setPayingKey] = useState<string | null>(null);

  async function handleSettlePayment(s: Settlement) {
    if (payingKey) return;
    if (
      !await confirmDialog(
        `Record that ${s.from.name} paid ${s.to.name} ${baseMoney(s.amount)}?\n\nTheir balances offset and this row disappears.${
          settlements.length === 1
            ? " This is the last outstanding transfer, so the active expenses will move to settled history."
            : " Original expenses stay untouched."
        }`
      )
    )
      return;
    setPayingKey(`${s.from.id}→${s.to.id}`);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/settle-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromMemberId: s.from.id,
            toMemberId: s.to.id,
            amount: s.amount,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(data.error ?? "Couldn't record the payment");
        return;
      }
      if (data.autoSettled) {
        showAlert(
          `All square — that was the last payment, so ${data.settlement?.expenseCount ?? 0} expenses moved to settled history.`
        );
      }
      fetchAll();
    } catch {
      showAlert("Network error — payment not recorded.");
    } finally {
      setPayingKey(null);
    }
  }

  const [remindingKey, setRemindingKey] = useState<string | null>(null);

  async function handleRemind(s: Settlement) {
    if (remindingKey) return;
    setRemindingKey(`${s.from.id}→${s.to.id}`);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/remind`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ debtorId: s.from.id }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAlert(data.error ?? `Couldn't send the reminder (HTTP ${res.status})`);
        return;
      }
      showAlert(
        `Reminder sent — ${s.from.name} has been nudged to settle ${baseMoney(s.amount)}.`
      );
      // Refetch so the new remindedAt arrives and the row flips to "Reminded".
      fetchAll();
    } catch {
      showAlert("Network error — reminder not sent.");
    } finally {
      setRemindingKey(null);
    }
  }

  const muted = group?.members.find((m) => m.userId === user?.userId)?.muted ?? false;
  const [muteBusy, setMuteBusy] = useState(false);

  async function handleToggleMute() {
    if (muteBusy || !group) return;
    const next = !muted;
    setMuteBusy(true);
    // Optimistic flip on the local member row; reverted below if the server
    // refuses, since a stale bell would misreport what notifications do.
    const applyMuted = (value: boolean) =>
      setGroup((g) =>
        g
          ? {
              ...g,
              members: g.members.map((m) =>
                m.userId === user?.userId ? { ...m, muted: value } : m
              ),
            }
          : g
      );
    applyMuted(next);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/mute`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ muted: next }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        applyMuted(!next);
        showAlert(data.error ?? `Couldn't update notifications for this group (HTTP ${res.status})`);
        return;
      }
      fetchAll();
    } catch {
      applyMuted(!next);
      showAlert("Network error — notification setting not changed.");
    } finally {
      setMuteBusy(false);
    }
  }

  async function handleSettle() {
    if (
      !await confirmDialog(
        "Settle all current expenses? They will move to settled history and balances will reset."
      )
    )
      return;
    setSettling(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/settle`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Settlement failed");
      showAlert(
        `Settled ${data.expenseCount} expenses. All balances are now cleared.`
      );
      setPage(1);
      fetchAll();
    } catch (err) {
      showAlert(err instanceof Error ? err.message : "Settlement failed");
    } finally {
      setSettling(false);
    }
  }

  if (loading && !group) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Loading group...
      </div>
    );
  }
  if (!group) return <p className="text-sm text-red-400">Group not found</p>;

  const totalPages = Math.max(1, Math.ceil(expenseTotal / PAGE_SIZE));
  // A pair result covers the whole group in one response, so paging controls
  // would be describing a list that is not paginated.
  const showPagination = !pair && expenseTotal > PAGE_SIZE;
  const rangeStart = expenseTotal === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(expenseTotal, page * PAGE_SIZE);
  const isCreator = user?.userId === group.createdBy;
  const deleteRequests = group.deleteRequests ?? [];
  // Only the creator can act on these, so only they get the gear badge.
  const pendingDeleteRequests = isCreator ? deleteRequests.length : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={onBack}
            className="group inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-brand-500"
          >
            <span className="transition-transform group-hover:-translate-x-1">←</span>
            Back to groups
          </button>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-zinc-100">
            {group.name}
            {user?.userId === group.createdBy && (
              <button
                onClick={handleRenameGroup}
                title="Rename group"
                className="text-sm text-zinc-600 transition-colors hover:text-brand-400"
              >
                ✎
              </button>
            )}
          </h2>
          {group.description && (
            <p className="text-xs text-zinc-500">{group.description}</p>
          )}
        </div>
        {/* Add Expense lives on the Active tab (heading row + phone FAB);
            share, members and delete live in the settings modal. */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleToggleMute}
            disabled={muteBusy}
            title={muted ? "Unmute notifications for this group" : "Mute notifications for this group"}
            aria-label={muted ? "Unmute notifications for this group" : "Mute notifications for this group"}
            className={cn(
              "inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-2 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50",
              muted ? "text-zinc-500" : "text-zinc-200"
            )}
          >
            {muted ? <BellOffIcon /> : <BellIcon />}
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title={
              pendingDeleteRequests > 0
                ? "Group settings — members asked you to delete this group"
                : "Group settings"
            }
            aria-label={
              pendingDeleteRequests > 0
                ? "Group settings — members asked you to delete this group"
                : "Group settings"
            }
            aria-haspopup="dialog"
            className="relative inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/40 px-2.5 py-2 text-zinc-200 transition-colors hover:border-zinc-500"
          >
            <GearIcon />
            {/* The creator has no other cue that someone asked for deletion. */}
            {pendingDeleteRequests > 0 && (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-zinc-950 bg-amber-400" />
            )}
          </button>
        </div>
      </div>

      <nav className="relative flex gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1 backdrop-blur-sm">
        {(
          [
            { key: "active", label: "Active", icon: ActiveIcon },
            { key: "history", label: "Settled", icon: HistoryIcon },
            { key: "report", label: "Report", icon: ReportIcon },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-all sm:gap-2 sm:px-4 sm:flex-none",
              tab === t.key
                ? "bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
            )}
          >
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <div key={tab} className="flex flex-col gap-6">
        {tab === "active" && (
          <>
            <MembersSection
              members={group.members}
              balances={balances}
              cur={baseCurrency}
              onManage={() => setShowSettings(true)}
            />

            {settlements.length > 0 && (
              <SettleUpSection
                settlements={settlements}
                balances={balances}
                settling={settling}
                onSettle={handleSettle}
                onSettlePayment={handleSettlePayment}
                payingKey={payingKey}
                onRemind={handleRemind}
                remindingKey={remindingKey}
                userId={user?.userId}
                cur={baseCurrency}
              />
            )}

            {group.members.filter((m) => m.isActive).length > 1 && (
              <section className="flex flex-col gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  Between two members
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.members
                    .filter((m) => m.isActive)
                    .map((m) => {
                      const isA = pairA === m.userId;
                      const isB = pairB === m.userId;
                      return (
                        <button
                          key={m.userId}
                          type="button"
                          onClick={() => selectPairMember(m.userId)}
                          className={cn(
                            "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all",
                            isA
                              ? "border-brand-500/60 bg-brand-500/15 text-brand-300"
                              : isB
                                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                                : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                          )}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                </div>

                {pair ? (
                  <div className="flex flex-col gap-1 border-t border-zinc-800/60 pt-2">
                    <div className="text-sm text-zinc-300">
                      {pair.expenseCount}{" "}
                      {pair.expenseCount === 1 ? "expense" : "expenses"} together
                      · {baseMoney(pair.total)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {pair.memberA.name} {baseMoney(pair.shareA)} ·{" "}
                      {pair.memberB.name} {baseMoney(pair.shareB)}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-base font-bold",
                        Math.abs(pair.net) < 0.01
                          ? "text-zinc-400"
                          : "text-emerald-300"
                      )}
                    >
                      {Math.abs(pair.net) < 0.01
                        ? "They're square"
                        : pair.net > 0
                          ? `${pair.memberB.name} owes ${pair.memberA.name} ${baseMoney(pair.net)}`
                          : `${pair.memberA.name} owes ${pair.memberB.name} ${baseMoney(-pair.net)}`}
                    </div>
                    {/* The group plan nets debts through other people, so it
                        can differ from what is directly between two members. */}
                    <div className="text-[11px] text-zinc-600">
                      Only expenses one of them paid for the other. The Settle Up
                      plan above may route this through someone else.
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">
                    Pick two members to see what they have between them.
                  </div>
                )}
              </section>
            )}

            {/* Bottom room on phones so the floating Add button never sits on
                the last row or the pagination. */}
            <section className="flex flex-col gap-3 pb-20 sm:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {pair ? "Shared expenses" : "Active Expenses"}{" "}
                  <span className="ml-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                    {pair ? visibleExpenses.length : expenseTotal}
                  </span>
                </h3>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Settling is otherwise only reachable from the Settle Up
                      panel, which is hidden once every balance is square. */}
                  {settlements.length === 0 && expenses.length > 0 && (
                    <button
                      onClick={handleSettle}
                      disabled={settling}
                      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      {settling ? "Settling…" : "Mark all settled"}
                    </button>
                  )}
                  <button
                    onClick={() => setOnlyMine((v) => !v)}
                    className={cn(
                      "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                      onlyMine
                        ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                    )}
                  >
                    {onlyMine ? "✓ Only mine" : "Only mine"}
                  </button>
                  <span className="font-mono text-sm font-semibold tabular-nums text-brand-300">
                    Total: {baseMoney(activeAmount)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span className="font-mono text-sm font-semibold tabular-nums text-emerald-300">
                      {baseMoney(activeMine)}
                    </span>
                    <span className="text-[11px] text-zinc-500">mine</span>
                  </span>
                  {showPagination && (
                    <span className="text-xs text-zinc-500">
                      {rangeStart}–{rangeEnd} of {expenseTotal}
                    </span>
                  )}
                  {/* sm and up; phones get the floating button below. */}
                  <button
                    onClick={() => setShowAdd(true)}
                    className="group relative hidden items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03] sm:inline-flex"
                  >
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    <span className="relative">+ Add Expense</span>
                  </button>
                </div>
              </div>

              {visibleExpenses.length === 0 ? (
                <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
                  <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                  <p className="relative text-sm text-zinc-400">
                    {onlyMine
                      ? "No active expenses include you."
                      : "All cleared! No unsettled expenses."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {visibleExpenses.map((e, i) => (
                    <ExpenseRow
                      key={e._id}
                      index={i}
                      expense={e}
                      userId={user?.userId}
                      onEdit={() => setEditingExpense(e)}
                      onDelete={() => handleDeleteExpense(e._id)}
                    />
                  ))}
                </div>
              )}

              {showPagination && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  onChange={setPage}
                />
              )}
            </section>
          </>
        )}

        {tab === "history" && (
          <SettledHistoryView
            history={settlementHistory}
            base={baseCurrency}
            onReopen={confirmReopen}
            reopening={reopening}
          />
        )}

        {tab === "report" && (
          <GroupReport groupId={groupId} groupName={group.name} />
        )}
      </div>

      {/* Phones only. Portalled to <body>: an ancestor keeps a transform from
          its entrance animation, which would otherwise anchor `fixed` to that
          box instead of the viewport. */}
      {tab === "active" &&
        typeof document !== "undefined" &&
        createPortal(
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            aria-label="Add expense"
            title="Add expense"
            className="fixed bottom-6 right-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 text-white shadow-lg shadow-brand-500/40 transition-transform hover:scale-105 active:scale-95 sm:hidden"
          >
            <PlusIcon />
          </button>,
          document.body
        )}

      {showSettings && (
        <GroupSettingsModal
          onClose={() => setShowSettings(false)}
          viewerId={user?.userId}
          creatorId={group.createdBy}
          groupName={group.name}
          onRename={renameGroup}
          members={group.members}
          onRemoveMember={handleRemoveMember}
          removingId={removingMemberId}
          suggestions={suggestions}
          suggestionsOpen={memberFocused}
          setSuggestionsOpen={setMemberFocused}
          newMember={newMember}
          setNewMember={setNewMember}
          onAddMember={handleAddMember}
          addingMember={addingMember}
          newGuest={newGuest}
          setNewGuest={setNewGuest}
          onAddGuest={handleAddGuest}
          addingGuest={addingGuest}
          muted={muted}
          muteBusy={muteBusy}
          onToggleMute={handleToggleMute}
          shareId={shareId}
          shareUrl={shareUrl}
          shareBusy={shareBusy}
          onToggleShare={toggleShare}
          onCopyShare={copyShare}
          copied={copied}
          deleteRequests={deleteRequests}
          deleteRequestBusy={deleteRequestBusy}
          onDeleteGroup={handleDeleteGroup}
          onRequestDelete={handleRequestDelete}
          onClearDeleteRequests={handleClearDeleteRequests}
        />
      )}

      {showAdd && (
        <AddExpenseModal
          preselectedGroupId={groupId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            fetchAll();
          }}
        />
      )}

      {editingExpense && (
        <AddExpenseModal
          editExpense={{ ...editingExpense, type: "group", groupId }}
          onClose={() => setEditingExpense(null)}
          onSaved={() => {
            setEditingExpense(null);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

/** Read-only on the Active tab: who is in the group and where each stands.
 *  Inviting, adding guests and removing members happen in the settings modal. */
function MembersSection({
  members,
  balances,
  cur,
  onManage,
}: {
  members: Member[];
  balances: Balance[];
  cur: string;
  onManage: () => void;
}) {
  const money = (n: number) => formatMoney(n, cur);
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">Members</h3>
        <button
          type="button"
          onClick={onManage}
          aria-haspopup="dialog"
          className="text-xs font-medium text-brand-400 transition-colors hover:text-brand-300"
        >
          Manage
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => {
          const bal = balances.find((b) => b.memberId === m.userId);
          const tone = !m.isActive
            ? "border-zinc-800/60 bg-zinc-950/40 opacity-60"
            : bal && bal.netBalance > 0.01
            ? "border-emerald-500/30 bg-emerald-500/5"
            : bal && bal.netBalance < -0.01
            ? "border-red-500/30 bg-red-500/5"
            : "border-zinc-800 bg-zinc-950/60";
          return (
            <div
              key={m.userId}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                tone
              )}
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-fuchsia-500/20 text-[10px] font-semibold text-zinc-200">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 break-words text-sm text-zinc-200">{m.name}</span>
              {m.isGuest && (
                <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">
                  guest
                </span>
              )}
              {!m.isActive && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-400">
                  left
                </span>
              )}
              {bal && (
                <span
                  className={cn(
                    "ml-auto whitespace-nowrap font-mono text-xs tabular-nums",
                    bal.netBalance > 0.01
                      ? "text-emerald-400"
                      : bal.netBalance < -0.01
                      ? "text-red-400"
                      : "text-zinc-500"
                  )}
                >
                  {bal.netBalance > 0 ? "+" : ""}{money(bal.netBalance)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SettleUpSection({
  settlements,
  balances,
  settling,
  onSettle,
  onSettlePayment,
  payingKey,
  onRemind,
  remindingKey,
  userId,
  cur,
}: {
  settlements: Settlement[];
  balances: Balance[];
  settling: boolean;
  onSettle: () => void;
  onSettlePayment: (s: Settlement) => void;
  payingKey: string | null;
  onRemind: (s: Settlement) => void;
  remindingKey: string | null;
  userId?: string;
  cur: string;
}) {
  const money = (n: number) => formatMoney(n, cur);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const recentlyReminded = (at?: string | null) =>
    !!at && Date.now() - new Date(at).getTime() < DAY_MS;

  // Open when the plan involves the viewer — they have something to do here;
  // otherwise it is other people's business and starts folded away. Decided
  // once on mount, then the viewer's toggle wins.
  const [open, setOpen] = useState(
    () =>
      !!userId &&
      settlements.some((s) => s.from.id === userId || s.to.id === userId)
  );

  const myNet = userId
    ? (balances.find((b) => b.memberId === userId)?.netBalance ?? 0)
    : null;
  const count = settlements.length;
  const summary =
    `${count} ${count === 1 ? "payment" : "payments"} to settle` +
    (myNet === null
      ? ""
      : myNet < -0.01
        ? ` · you owe ${money(-myNet)}`
        : myNet > 0.01
          ? ` · you're owed ${money(myNet)}`
          : " · you're all square");

  return (
    <section className="relative overflow-hidden rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-amber-500/5 p-5 backdrop-blur-sm">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
      <div className={cn("flex items-center justify-between gap-3", open && "mb-3")}>
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-amber-300">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="settle-up-rows"
            className="flex w-full min-w-0 flex-col gap-1 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
          >
            <span className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Settle Up
              <ChevronDownIcon
                className={cn(
                  "text-amber-300/70 transition-transform duration-200",
                  open && "rotate-180"
                )}
              />
            </span>
            {!open && (
              <span className="text-xs font-normal text-zinc-400">{summary}</span>
            )}
          </button>
        </h3>
        <button
          onClick={(e) => {
            // Settling is not a request to fold or unfold the panel.
            e.stopPropagation();
            onSettle();
          }}
          disabled={settling}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black shadow-lg shadow-amber-500/30 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          {settling ? "Settling..." : "Mark as Settled"}
        </button>
      </div>
      <div id="settle-up-rows" hidden={!open} className={cn(open && "flex flex-col gap-2")}>
        {settlements.map((s, i) => {
          const rowKey = `${s.from.id}→${s.to.id}`;
          // Only the creditor can nudge, and only a real account can be
          // notified — guests have no inbox to nudge.
          const canRemind =
            !!userId && s.to.id === userId && !s.from.id.startsWith("guest:");
          const reminded = recentlyReminded(s.remindedAt);
          return (
            <div
              key={rowKey}
              className="animate-fade-up flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-3 py-2 text-sm"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {/* Phones give the two names a line of their own — squeezed onto
                  one row with the amount and buttons they read as "Ra… → Pri…". */}
              <span className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
                <span className="min-w-0 truncate font-medium text-red-400">{s.from.name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                <span className="min-w-0 truncate font-medium text-emerald-400">{s.to.name}</span>
              </span>
              <span className="whitespace-nowrap font-mono tabular-nums text-zinc-100 sm:ml-auto">
                {money(s.amount)}
              </span>
              <button
                onClick={() => onSettlePayment(s)}
                disabled={payingKey !== null}
                title={`Record that ${s.from.name} paid ${s.to.name}`}
                className="ml-auto shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 sm:ml-0"
              >
                {payingKey === rowKey ? "…" : "Settle"}
              </button>
              {canRemind && (
                <button
                  onClick={() => onRemind(s)}
                  disabled={reminded || remindingKey !== null}
                  title={
                    reminded
                      ? `${s.from.name} was reminded in the last 24 hours`
                      : `Remind ${s.from.name} to settle up`
                  }
                  className={cn(
                    "shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50",
                    reminded && "cursor-not-allowed"
                  )}
                >
                  {remindingKey === rowKey ? "…" : reminded ? "Reminded" : "Remind"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ExpenseRow({
  expense: e,
  index,
  userId,
  onEdit,
  onDelete,
}: {
  expense: Expense;
  index: number;
  userId?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Rows show the amount as entered — label it with the row's own currency.
  const money = (n: number) => formatMoney(n, e.currency ?? "INR");
  // The viewer's slice of the split — 0 when the split leaves them out.
  const myShare = userId
    ? (e.splits?.find((sp) => sp.memberId === userId)?.amount ?? 0)
    : 0;
  return (
    <div
      className="animate-fade-up group flex flex-col gap-2 rounded-lg border border-zinc-800/80 bg-gradient-to-b from-zinc-900/40 to-zinc-950/40 px-4 py-3 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-zinc-700 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-100">
            {e.isSettlement ? "↔ " : ""}{e.description}
          </span>
          {e.isSettlement ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-400">
              settlement
            </span>
          ) : (
            <span className="rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {e.category}
            </span>
          )}
        </div>
        <span className="text-[11px] text-zinc-500">
          {e.isSettlement ? (
            <>Recorded {new Date(e.date).toLocaleDateString()}</>
          ) : (
            <>
              Paid by{" "}
              <span className="font-medium text-zinc-300">{e.paidBy.name}</span> ·
              Split {e.splitAmong.length} ways
              {e.splitMode && e.splitMode !== "equal"
                ? ` (${SPLIT_LABEL[e.splitMode]})`
                : ""}{" "}
              ·{" "}
              {formatDay(e.date)}
            </>
          )}
        </span>
        {!e.isSettlement && (
          <span className="truncate text-[11px] text-zinc-600">
            {e.splitAmong.map((m) => m.name).join(", ")}
          </span>
        )}
      </div>
      {/* On phones the amount and actions sit on their own line, so a long
          description is not squeezed into a three-word column. */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-800/60 pt-2 sm:justify-start sm:border-0 sm:pt-0">
        <span className="flex flex-col items-start sm:items-end">
          <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
            {money(e.amount)}
          </span>
          {!e.isSettlement && (
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                myShare > 0 ? "font-semibold text-emerald-300" : "text-zinc-600"
              )}
            >
              {myShare > 0 ? `${money(myShare)} mine` : "not yours"}
            </span>
          )}
        </span>
        <span className="flex items-center gap-3">
          {!e.isSettlement && (
            <button
              onClick={onEdit}
              className="text-[11px] text-zinc-500 transition-colors hover:text-brand-400"
            >
              Edit
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-[11px] text-zinc-500 transition-colors hover:text-red-400"
          >
            {e.isSettlement ? "Undo" : "Delete"}
          </button>
        </span>
      </div>
    </div>
  );
}

function SettledHistoryView({
  history,
  base,
  onReopen,
  reopening,
}: {
  history: SettlementRecord[];
  base: string;
  onReopen: (rec: SettlementRecord) => void;
  reopening: boolean;
}) {
  if (history.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>
        <p className="relative text-sm text-zinc-400">
          No settlement history yet. Settle active expenses to see records here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {history.map((record, i) => (
        <section
          key={record.settlementId}
          className="animate-fade-up relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-3 backdrop-blur-sm sm:p-5"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-100">
              Settled on{" "}
              {new Date(record.settledAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </h3>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {record.expenses.length} expenses
              </span>
              {/* Only the newest batch can go back — reviving an older one
                  while newer settlements exist would interleave two closed
                  periods into one active window. */}
              {i === 0 && (
                <button
                  onClick={() => onReopen(record)}
                  disabled={reopening}
                  className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                >
                  {reopening ? "Reopening…" : "Reopen"}
                </button>
              )}
            </div>
          </div>

          <SettlementSummary
            expenses={record.expenses}
            transfers={record.transfers}
            base={base}
          />
        </section>
      ))}
    </div>
  );
}

function SettlementSummary({
  expenses,
  transfers,
  base,
}: {
  expenses: Expense[];
  transfers?: SettlementTransfer[];
  base: string;
}) {
  // Base-currency figures throughout, matching calculateBalances and the live
  // Settle Up panel — splits are stored in the entry currency, so they are
  // scaled by the same base/entry ratio.
  const total = expenses.reduce((sum, e) => sum + (e.amountBase ?? e.amount), 0);
  const money = (n: number) => formatMoney(n, base);

  const members = new Map<string, { name: string; paid: number; share: number }>();
  for (const e of expenses) {
    const baseAmt = e.amountBase ?? e.amount;
    const ratio = e.amount > 0 ? baseAmt / e.amount : 1;
    const payerId = e.paidBy?.id ?? e.paidBy?.name;
    if (!members.has(payerId)) {
      members.set(payerId, { name: e.paidBy.name, paid: 0, share: 0 });
    }
    members.get(payerId)!.paid += baseAmt;

    for (const s of e.splits ?? []) {
      if (!members.has(s.memberId)) {
        members.set(s.memberId, { name: s.name, paid: 0, share: 0 });
      }
      members.get(s.memberId)!.share += s.amount * ratio;
    }
  }

  const sorted = Array.from(members.values()).sort(
    (a, b) => b.paid - b.share - (a.paid - a.share)
  );

  // Minimal-transfer plan recomputed from Paid − Share (greedy
  // largest-creditor/largest-debtor matching — same as the active settle).
  const creditors = sorted
    .filter((m) => m.paid - m.share > 0.01)
    .map((m) => ({ name: m.name, amt: m.paid - m.share }));
  const debtors = sorted
    .filter((m) => m.share - m.paid > 0.01)
    .map((m) => ({ name: m.name, amt: m.share - m.paid }))
    .sort((a, b) => b.amt - a.amt);
  const plan: { from: string; to: string; amount: number }[] = [];
  let ci = 0;
  let di = 0;
  while (di < debtors.length && ci < creditors.length) {
    const x = Math.min(debtors[di].amt, creditors[ci].amt);
    plan.push({
      from: debtors[di].name,
      to: creditors[ci].name,
      amount: Math.round(x * 100) / 100,
    });
    debtors[di].amt -= x;
    creditors[ci].amt -= x;
    if (debtors[di].amt < 0.01) di++;
    if (creditors[ci].amt < 0.01) ci++;
  }

  const settledVia =
    transfers && transfers.length > 0
      ? transfers.map((t) => ({
          from: t.from.name,
          to: t.to.name,
          amount: t.amount,
        }))
      : plan;

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] text-zinc-500">
        Total:{" "}
        <span className="font-semibold tabular-nums text-zinc-200">
          {money(total)}
        </span>
      </div>

      {/* Who paid whom in this settlement. Batches closed after settle-up
          payments were tracked carry the real transfers; older ones fall back
          to the plan recomputed from Paid − Share. */}
      {settledVia.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/90">
            Settled via
          </div>
          {settledVia.map((p, i) => (
            <div
              key={`${p.from}→${p.to}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1 text-[11px] leading-snug">
                <span className="text-red-400">{p.from}</span>
                <span className="text-zinc-600"> → </span>
                <span className="text-emerald-400">{p.to}</span>
              </div>
              <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums text-zinc-200">
                {money(p.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Compact grid table (app-style) — fits phone widths without the
          oversized monospace look; numbers never wrap. */}
      <div className="overflow-hidden rounded-lg border border-zinc-800/60">
        <div className="grid grid-cols-[minmax(64px,1.2fr)_1fr_1fr_1.1fr] gap-x-2 border-b border-zinc-800/60 bg-zinc-900/60 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
          <span>Member</span>
          <span className="text-right">Paid</span>
          <span className="text-right">Share</span>
          <span className="text-right">Net</span>
        </div>
        {sorted.map((m) => {
          const net = m.paid - m.share;
          return (
            <div
              key={m.name}
              className="grid grid-cols-[minmax(64px,1.2fr)_1fr_1fr_1.1fr] items-center gap-x-2 px-2.5 py-1.5 text-[11px] tabular-nums odd:bg-white/[0.015]"
            >
              <span className="truncate text-zinc-200">{m.name}</span>
              <span className="whitespace-nowrap text-right text-zinc-400">{money(m.paid)}</span>
              <span className="whitespace-nowrap text-right text-zinc-400">{money(m.share)}</span>
              <span
                className={cn(
                  "whitespace-nowrap text-right font-semibold",
                  net > 0.01
                    ? "text-emerald-400"
                    : net < -0.01
                    ? "text-red-400"
                    : "text-zinc-500"
                )}
              >
                {net > 0 ? "+" : ""}{money(net)}
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-[minmax(64px,1.2fr)_1fr_1fr_1.1fr] gap-x-2 border-t border-zinc-700/60 bg-zinc-900/40 px-2.5 py-1.5 text-[11px] tabular-nums">
          <span className="font-semibold text-zinc-200">Total</span>
          <span className="whitespace-nowrap text-right font-semibold text-zinc-200">{money(total)}</span>
          <span className="whitespace-nowrap text-right font-semibold text-zinc-200">
            {money(sorted.reduce((s, m) => s + m.share, 0))}
          </span>
          <span className="text-right text-zinc-500">—</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {expenses.map((e) => (
          <div
            key={e._id}
            className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-zinc-200">{e.description}</span>
              <span className="truncate text-zinc-600">
                Paid by {e.paidBy.name} ·{" "}
                {formatDay(e.date)} ·{" "}
                {e.splitAmong.map((m) => m.name).join(", ")}
              </span>
            </div>
            <span className="font-mono tabular-nums text-zinc-300">
              {money(e.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const pages = pageNumbers(page, totalPages);
  return (
    <div className="flex items-center justify-center gap-1 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 backdrop-blur-sm">
      <PageBtn disabled={page === 1} onClick={() => onChange(page - 1)} aria-label="Previous">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </PageBtn>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e-${i}`} className="px-2 text-xs text-zinc-600">
            …
          </span>
        ) : (
          <PageBtn key={p} active={p === page} onClick={() => onChange(p)}>
            {p}
          </PageBtn>
        )
      )}
      <PageBtn
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        aria-label="Next"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </PageBtn>
    </div>
  );
}

function PageBtn({
  active,
  disabled,
  onClick,
  children,
  ...rest
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-medium transition-all",
        active
          ? "border-brand-500/60 bg-brand-500/15 text-brand-500 shadow-[0_0_15px_-5px_rgba(99,102,241,0.6)]"
          : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
        disabled &&
          "cursor-not-allowed opacity-40 hover:border-zinc-800 hover:text-zinc-400"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ActiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 9-9 9.74 9.74 0 0 0-7 3" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
