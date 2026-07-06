import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Redirect,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useAuth } from "../../lib/auth";
import type {
  Balance,
  Expense,
  Group,
  Member,
  Settlement,
  SettlementRecord,
} from "../../lib/types";
import { AppBackground, Input, KeyboardAwareScreen } from "../../components/ui";
import { GroupReportView } from "../../components/GroupReportView";
import { WEB_BASE_URL } from "../../lib/api";
import { formatMoney } from "../../lib/currency";

type Tab = "active" | "settled" | "report";

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

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = id ?? "";
  const { user, authFetch } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activeTotal, setActiveTotal] = useState(0);
  const [history, setHistory] = useState<SettlementRecord[]>([]);
  const [tab, setTab] = useState<Tab>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [newMember, setNewMember] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [newGuest, setNewGuest] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const cur = dominantCurrency(expenses);
  const money = (n: number) => formatMoney(n, cur);

  async function shareSplit() {
    if (sharing) return;
    setSharing(true);
    try {
      let id = shareId;
      if (!id) {
        const res = await authFetch(`/api/projects/expense-tracker/groups/${groupId}/share`, { method: "POST" });
        id = res.ok ? ((await res.json().catch(() => ({})))?.shareId ?? null) : null;
        if (id) setShareId(id);
      }
      if (!id) return Alert.alert("Couldn't create share link");
      const url = `${WEB_BASE_URL}/share/${id}`;
      await Share.share({ message: `Here's our bill split: ${url}` });
    } catch {
      Alert.alert("Error", "Couldn't share the link — try again.");
    } finally {
      setSharing(false);
    }
  }

  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  function confirmRemoveMember(m: Member) {
    Alert.alert(
      `Remove ${m.name}?`,
      "Their past expenses and balances stay recorded — if they have any, they'll be marked as \"left\" and excluded from new expenses. Re-adding them brings them back.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setRemovingMemberId(m.userId);
            try {
              const res = await authFetch(
                `/api/projects/expense-tracker/groups/${groupId}/members?memberId=${encodeURIComponent(m.userId)}`,
                { method: "DELETE" }
              );
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                Alert.alert("Error", data.error ?? "Couldn't remove member");
                return;
              }
              fetchAll();
            } catch {
              Alert.alert("Error", "Network error — member not removed.");
            } finally {
              setRemovingMemberId(null);
            }
          },
        },
      ]
    );
  }

  function stopSharing() {
    Alert.alert("Turn off sharing", "The public link will stop working.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Turn off", style: "destructive",
        onPress: async () => {
          try {
            const res = await authFetch(`/api/projects/expense-tracker/groups/${groupId}/share`, { method: "DELETE" });
            // Only report sharing as off if the server revoked it — otherwise
            // the public link would still work while the UI says it's off.
            if (!res.ok) throw new Error();
            setShareId(null);
          } catch {
            Alert.alert("Error", "Couldn't turn off sharing — try again.");
          }
        },
      },
    ]);
  }

  const fetchAll = useCallback(async () => {
    try {
      const [gRes, bRes, eRes, sRes, hRes] = await Promise.all([
        authFetch(`/api/projects/expense-tracker/groups/${groupId}`),
        authFetch(`/api/projects/expense-tracker/reports/balances/${groupId}`),
        authFetch(
          `/api/projects/expense-tracker/expenses?groupId=${groupId}&limit=100&settled=false`
        ),
        authFetch(
          `/api/projects/expense-tracker/reports/summary?groupId=${groupId}&settled=false`
        ),
        authFetch(`/api/projects/expense-tracker/groups/${groupId}/history`),
      ]);
      const [g, b, e, s, h] = await Promise.all([
        gRes.json(), bRes.json(), eRes.json(), sRes.json(), hRes.json(),
      ]);
      setGroup(g.group ?? null);
      setShareId(g.group?.shareId ?? null);
      setBalances(b.balances ?? []);
      setSettlements(b.settlements ?? []);
      setExpenses(e.expenses ?? []);
      setActiveTotal(s.totalAmount ?? 0);
      setHistory(h.history ?? []);
    } catch {
      // keep last good state
    }
  }, [groupId, authFetch]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchAll().finally(() => setLoading(false));
    }, [fetchAll])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  function handleDelete(e: Expense) {
    Alert.alert("Delete expense", `Delete "${e.description}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await authFetch(`/api/projects/expense-tracker/expenses/${e._id}`, {
              method: "DELETE",
            });
            if (!res.ok) throw new Error();
            fetchAll();
          } catch {
            Alert.alert("Error", "Failed to delete");
          }
        },
      },
    ]);
  }

  function handleSettle() {
    Alert.alert(
      "Settle up",
      "Settle all active expenses? They move to settled history and balances reset.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Settle",
          onPress: async () => {
            setSettling(true);
            try {
              const res = await authFetch(
                `/api/projects/expense-tracker/groups/${groupId}/settle`,
                { method: "POST" }
              );
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Settlement failed");
              Alert.alert("Settled", `Cleared ${data.expenseCount} expenses.`);
              fetchAll();
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Settlement failed"
              );
            } finally {
              setSettling(false);
            }
          },
        },
      ]
    );
  }

  async function handleAddMember() {
    const email = newMember.trim();
    if (!email) return;
    setAddingMember(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send invite");
      Alert.alert(
        "Invite sent",
        `${email} will join once they accept the invite (they'll get a notification).`
      );
      setNewMember("");
      fetchAll();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed");
    } finally {
      setAddingMember(false);
    }
  }

  async function handleAddGuest() {
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
      Alert.alert("Error", err instanceof Error ? err.message : "Failed");
    } finally {
      setAddingGuest(false);
    }
  }

  function handleDeleteGroup() {
    Alert.alert(
      "Delete group",
      "Delete this group and ALL its expenses? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await authFetch(
                `/api/projects/expense-tracker/groups/${groupId}`,
                { method: "DELETE" }
              );
              // Don't navigate away on failure — the group still exists.
              if (!res.ok) throw new Error();
              router.back();
            } catch {
              Alert.alert("Error", "Failed to delete group");
            }
          },
        },
      ]
    );
  }

  if (!user) return <Redirect href="/login" />;

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm text-zinc-400">← Groups</Text>
        </Pressable>
        <Text className="flex-1 px-3 text-center text-base font-semibold text-zinc-100" numberOfLines={1}>
          {group?.name ?? "Group"}
        </Text>
        <Pressable
          onPress={() =>
            router.push({ pathname: "/add-expense", params: { groupId } })
          }
          hitSlop={12}
        >
          <Text className="text-sm font-semibold text-brand-400">+ Add</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-1 px-4 pb-2">
        {(["active", "settled", "report"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            className={`flex-1 items-center rounded-lg py-2 ${
              tab === t ? "bg-brand-600" : "bg-zinc-900/40"
            }`}
          >
            <Text
              className={`text-xs font-medium capitalize ${
                tab === t ? "text-white" : "text-zinc-400"
              }`}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      <KeyboardAwareScreen
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 14 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {loading && !group ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#6366f1" />
          </View>
        ) : tab === "active" ? (
          <>
            {/* Members + balances */}
            <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <Text className="mb-3 text-sm font-semibold text-zinc-100">Members</Text>
              <View className="flex-row flex-wrap gap-2">
                {group?.members.map((m) => {
                  const bal = balances.find((b) => b.memberId === m.userId);
                  const net = bal?.netBalance ?? 0;
                  const canRemove =
                    user?.userId === group.createdBy &&
                    m.isActive &&
                    m.userId !== group.createdBy;
                  return (
                    <View
                      key={m.userId}
                      className={`flex-row items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2 ${
                        m.isActive ? "" : "opacity-60"
                      }`}
                    >
                      <Text className="text-sm text-zinc-200">{m.name}</Text>
                      {m.isGuest && (
                        <Text className="rounded-full border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[9px] uppercase text-zinc-400">
                          guest
                        </Text>
                      )}
                      {!m.isActive && (
                        <Text className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase text-amber-400">
                          left
                        </Text>
                      )}
                      {bal && (
                        <Text
                          className={`text-xs font-medium ${
                            net > 0.01
                              ? "text-emerald-400"
                              : net < -0.01
                              ? "text-red-400"
                              : "text-zinc-500"
                          }`}
                        >
                          {net > 0 ? "+" : ""}{money(net)}
                        </Text>
                      )}
                      {canRemove && (
                        <Pressable
                          onPress={() => confirmRemoveMember(m)}
                          hitSlop={8}
                          disabled={removingMemberId !== null}
                        >
                          <Text className="text-xs text-zinc-600">
                            {removingMemberId === m.userId ? "…" : "✕"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>

              <View className="mt-3 flex-row gap-2">
                <Input
                  value={newMember}
                  onChangeText={setNewMember}
                  placeholder="Invite member by email"
                  placeholderTextColor="#71717a"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="flex-1 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
                />
                <Pressable
                  onPress={handleAddMember}
                  disabled={addingMember || !newMember.trim()}
                  className={`items-center justify-center rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 ${
                    addingMember || !newMember.trim() ? "opacity-50" : ""
                  }`}
                >
                  <Text className="text-xs font-semibold text-brand-400">
                    {addingMember ? "…" : "Add"}
                  </Text>
                </Pressable>
              </View>

              <View className="mt-2 flex-row gap-2">
                <Input
                  value={newGuest}
                  onChangeText={setNewGuest}
                  placeholder="Add a guest by name (no account)"
                  placeholderTextColor="#71717a"
                  className="flex-1 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
                />
                <Pressable
                  onPress={handleAddGuest}
                  disabled={addingGuest || !newGuest.trim()}
                  className={`items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 ${
                    addingGuest || !newGuest.trim() ? "opacity-50" : ""
                  }`}
                >
                  <Text className="text-xs font-semibold text-zinc-300">
                    {addingGuest ? "…" : "Guest"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Settle up */}
            {settlements.length > 0 && (
              <View className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-sm font-semibold text-amber-300">Settle Up</Text>
                  <Pressable
                    onPress={handleSettle}
                    disabled={settling}
                    className={`rounded-lg bg-amber-500 px-3 py-1.5 ${
                      settling ? "opacity-60" : ""
                    }`}
                  >
                    <Text className="text-xs font-semibold text-black">
                      {settling ? "Settling…" : "Mark as Settled"}
                    </Text>
                  </Pressable>
                </View>
                <View className="gap-2">
                  {settlements.map((s) => (
                    <View
                      // A minimal-transfer plan never repeats a payer→payee pair.
                      key={`${s.from.name}→${s.to.name}`}
                      className="flex-row items-center gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-3 py-2"
                    >
                      <Text className="text-sm text-red-400">{s.from.name}</Text>
                      <Text className="text-zinc-500">→</Text>
                      <Text className="text-sm text-emerald-400">{s.to.name}</Text>
                      <Text className="ml-auto text-sm text-zinc-100">
                        {money(s.amount)}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Calculation details */}
                <View className="mt-4 border-t border-amber-500/20 pt-3">
                  <Text className="mb-2 text-[13px] uppercase tracking-wider text-amber-300/80">
                    How it's calculated
                  </Text>
                  <View className="flex-row border-b border-white/10 pb-1" style={{ gap: 8 }}>
                    <Text style={{ flex: 1 }} className="text-[12px] uppercase text-zinc-500">Member</Text>
                    <Text style={{ width: 58 }} className="text-right text-[12px] uppercase text-zinc-500">Paid</Text>
                    <Text style={{ width: 58 }} className="text-right text-[12px] uppercase text-zinc-500">Share</Text>
                    <Text style={{ width: 66 }} className="text-right text-[12px] uppercase text-zinc-500">Net</Text>
                  </View>
                  {balances.map((b) => (
                    <View key={b.memberId} className="flex-row border-b border-white/5 py-1.5" style={{ gap: 8 }}>
                      <Text style={{ flex: 1 }} className="text-xs text-zinc-200" numberOfLines={1}>
                        {b.name}
                      </Text>
                      <Text style={{ width: 58 }} className="text-right text-[13px] text-zinc-300">
                        {money(b.totalPaid)}
                      </Text>
                      <Text style={{ width: 58 }} className="text-right text-[13px] text-zinc-300">
                        {money(b.totalOwed)}
                      </Text>
                      <Text
                        style={{ width: 66 }}
                        className={`text-right text-[13px] ${
                          b.netBalance > 0.01
                            ? "text-emerald-400"
                            : b.netBalance < -0.01
                            ? "text-red-400"
                            : "text-zinc-500"
                        }`}
                      >
                        {b.netBalance > 0 ? "+" : ""}{money(b.netBalance)}
                      </Text>
                    </View>
                  ))}
                  <Text className="mt-2 text-[12px] leading-4 text-zinc-500">
                    Net = Paid − Share. Positive → owed to them; negative → they
                    owe. The plan above settles everyone with the fewest transfers.
                  </Text>
                </View>
              </View>
            )}

            {/* Active expenses */}
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-zinc-100">
                Active Expenses ({expenses.length})
              </Text>
              <Text className="text-sm font-semibold text-zinc-100">
                Total: {money(activeTotal)}
              </Text>
            </View>

            {expenses.length === 0 ? (
              <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-10">
                <Text className="text-sm text-zinc-400">
                  All cleared! No unsettled expenses.
                </Text>
              </View>
            ) : (
              expenses.map((e) => (
                <View
                  key={e._id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="font-medium text-zinc-100" numberOfLines={1}>
                        {e.description}
                      </Text>
                      <Text className="mt-0.5 text-xs text-zinc-500">
                        Paid by {e.paidBy.name} ·{" "}
                        {new Date(e.date).toLocaleDateString()} · split{" "}
                        {e.splitAmong?.length ?? 0} ways
                      </Text>
                      {e.splitAmong && e.splitAmong.length > 0 && (
                        <Text className="mt-0.5 text-[13px] text-zinc-600" numberOfLines={2}>
                          Split: {e.splitAmong.map((m) => m.name).join(", ")}
                        </Text>
                      )}
                    </View>
                    <Text className="text-base font-semibold text-zinc-100">
                      {money(e.amount)}
                    </Text>
                  </View>
                  <View className="mt-3 flex-row justify-end gap-4 border-t border-white/5 pt-3">
                    <Pressable
                      hitSlop={8}
                      onPress={() =>
                        router.push({
                          pathname: "/add-expense",
                          params: { expense: JSON.stringify(e), groupId },
                        })
                      }
                    >
                      <Text className="text-xs font-medium text-zinc-400">Edit</Text>
                    </Pressable>
                    <Pressable hitSlop={8} onPress={() => handleDelete(e)}>
                      <Text className="text-xs font-medium text-red-400">Delete</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <Pressable
              onPress={shareSplit}
              className="mt-2 items-center rounded-xl border border-brand-500/30 bg-brand-500/10 py-3"
            >
              <Text className="text-sm font-medium text-white">
                {shareId ? "🔗 Share split link" : "Share split (create link)"}
              </Text>
            </Pressable>
            {shareId && (
              <Pressable onPress={stopSharing} className="items-center py-1">
                <Text className="text-[11px] text-zinc-500">Turn off public link</Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleDeleteGroup}
              className="mt-2 items-center rounded-xl border border-red-500/30 bg-red-500/5 py-3"
            >
              <Text className="text-sm font-medium text-red-400">
                Delete Group
              </Text>
            </Pressable>
          </>
        ) : tab === "settled" ? (
          history.length === 0 ? (
            <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
              <Text className="text-sm text-zinc-400">No settlement history yet.</Text>
            </View>
          ) : (
            history.map((rec) => (
              <SettlementCard key={rec.settlementId} record={rec} />
            ))
          )
        ) : (
          <GroupReportView groupId={groupId} groupName={group?.name ?? "Group"} />
        )}
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

/** Per-member Paid / Share / Net for a settled batch (mirrors the web summary). */
function settlementMembers(expenses: Expense[]) {
  const map = new Map<string, { id: string; name: string; paid: number; share: number }>();
  for (const e of expenses) {
    const pid = e.paidBy?.id ?? e.paidBy?.name ?? "?";
    if (!map.has(pid)) map.set(pid, { id: pid, name: e.paidBy?.name ?? "-", paid: 0, share: 0 });
    map.get(pid)!.paid += e.amount;
    for (const s of e.splits ?? []) {
      if (!map.has(s.memberId)) map.set(s.memberId, { id: s.memberId, name: s.name, paid: 0, share: 0 });
      map.get(s.memberId)!.share += s.amount;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.paid - b.share - (a.paid - a.share)
  );
}

function SettlementCard({ record }: { record: SettlementRecord }) {
  const total = record.expenses.reduce((s, e) => s + e.amount, 0);
  const members = settlementMembers(record.expenses);
  const totalShare = members.reduce((s, m) => s + m.share, 0);
  const money = (n: number) => formatMoney(n, dominantCurrency(record.expenses));

  return (
    <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-zinc-100">
          {new Date(record.settledAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </Text>
        <Text className="text-xs text-emerald-400">
          {record.expenses.length} expenses · {money(total)}
        </Text>
      </View>

      {/* Member calculation table */}
      <View className="overflow-hidden rounded-xl border border-white/10">
        <View className="flex-row bg-zinc-900/60 px-3 py-2" style={{ gap: 8 }}>
          <Text style={{ flex: 1 }} className="text-[12px] uppercase text-zinc-500">Member</Text>
          <Text style={{ width: 58 }} className="text-right text-[12px] uppercase text-zinc-500">Paid</Text>
          <Text style={{ width: 58 }} className="text-right text-[12px] uppercase text-zinc-500">Share</Text>
          <Text style={{ width: 64 }} className="text-right text-[12px] uppercase text-zinc-500">Net</Text>
        </View>
        {members.map((m) => {
          const net = m.paid - m.share;
          return (
            <View key={m.id} className="flex-row border-t border-white/5 px-3 py-2" style={{ gap: 8 }}>
              <Text style={{ flex: 1 }} className="text-xs text-zinc-200" numberOfLines={1}>
                {m.name}
              </Text>
              <Text style={{ width: 58 }} className="text-right text-[13px] text-zinc-300">
                {money(m.paid)}
              </Text>
              <Text style={{ width: 58 }} className="text-right text-[13px] text-zinc-300">
                {money(m.share)}
              </Text>
              <Text
                style={{ width: 64 }}
                className={`text-right text-[13px] ${
                  net > 0.01
                    ? "text-emerald-400"
                    : net < -0.01
                    ? "text-red-400"
                    : "text-zinc-500"
                }`}
              >
                {net > 0 ? "+" : ""}{money(net)}
              </Text>
            </View>
          );
        })}
        <View className="flex-row border-t border-white/10 bg-zinc-900/40 px-3 py-2" style={{ gap: 8 }}>
          <Text style={{ flex: 1 }} className="text-xs font-semibold text-zinc-200">Total</Text>
          <Text style={{ width: 58 }} className="text-right text-[13px] font-semibold text-zinc-200">
            {money(total)}
          </Text>
          <Text style={{ width: 58 }} className="text-right text-[13px] font-semibold text-zinc-200">
            {money(totalShare)}
          </Text>
          <Text style={{ width: 64 }} className="text-right text-[13px] text-zinc-500">—</Text>
        </View>
      </View>

      {/* Expense details */}
      <View className="mt-3 gap-2">
        {record.expenses.map((e) => (
          <View
            key={e._id}
            className="flex-row items-start justify-between gap-3 rounded-lg border border-white/5 bg-zinc-950/40 px-3 py-2"
          >
            <View className="flex-1">
              <Text className="text-xs text-zinc-200" numberOfLines={1}>
                {e.description}
              </Text>
              <Text className="mt-0.5 text-[12px] text-zinc-500" numberOfLines={1}>
                Paid by {e.paidBy.name} · {new Date(e.date).toLocaleDateString()}
                {e.splitAmong && e.splitAmong.length > 0
                  ? ` · ${e.splitAmong.map((m) => m.name).join(", ")}`
                  : ""}
              </Text>
            </View>
            <Text className="text-xs text-zinc-300">{money(e.amount)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
