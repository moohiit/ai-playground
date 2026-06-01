import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
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
  Settlement,
  SettlementRecord,
  Summary,
} from "../../lib/types";

type Tab = "active" | "settled" | "report";

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
  const [report, setReport] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [newMember, setNewMember] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [gRes, bRes, eRes, sRes, hRes, rRes] = await Promise.all([
        authFetch(`/api/projects/expense-tracker/groups/${groupId}`),
        authFetch(`/api/projects/expense-tracker/reports/balances/${groupId}`),
        authFetch(
          `/api/projects/expense-tracker/expenses?groupId=${groupId}&limit=100&settled=false`
        ),
        authFetch(
          `/api/projects/expense-tracker/reports/summary?groupId=${groupId}&settled=false`
        ),
        authFetch(`/api/projects/expense-tracker/groups/${groupId}/history`),
        authFetch(`/api/projects/expense-tracker/reports/summary?groupId=${groupId}`),
      ]);
      const [g, b, e, s, h, r] = await Promise.all([
        gRes.json(), bRes.json(), eRes.json(), sRes.json(), hRes.json(), rRes.json(),
      ]);
      setGroup(g.group ?? null);
      setBalances(b.balances ?? []);
      setSettlements(b.settlements ?? []);
      setExpenses(e.expenses ?? []);
      setActiveTotal(s.totalAmount ?? 0);
      setHistory(h.history ?? []);
      setReport(r);
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
            await authFetch(`/api/projects/expense-tracker/expenses/${e._id}`, {
              method: "DELETE",
            });
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
      if (!res.ok) throw new Error(data.error ?? "Failed to add member");
      setNewMember("");
      fetchAll();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed");
    } finally {
      setAddingMember(false);
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
              await authFetch(
                `/api/projects/expense-tracker/groups/${groupId}`,
                { method: "DELETE" }
              );
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
    <SafeAreaView className="flex-1 bg-[#05060a]" edges={["top"]}>
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

      <ScrollView
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
                  return (
                    <View
                      key={m.userId}
                      className="flex-row items-center gap-2 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2"
                    >
                      <Text className="text-sm text-zinc-200">{m.name}</Text>
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
                          {net > 0 ? "+" : ""}₹{net.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              <View className="mt-3 flex-row gap-2">
                <TextInput
                  value={newMember}
                  onChangeText={setNewMember}
                  placeholder="Add member by email"
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
                  {settlements.map((s, i) => (
                    <View
                      key={i}
                      className="flex-row items-center gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-3 py-2"
                    >
                      <Text className="text-sm text-red-400">{s.from.name}</Text>
                      <Text className="text-zinc-500">→</Text>
                      <Text className="text-sm text-emerald-400">{s.to.name}</Text>
                      <Text className="ml-auto text-sm text-zinc-100">
                        ₹{s.amount.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Active expenses */}
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-zinc-100">
                Active Expenses ({expenses.length})
              </Text>
              <Text className="text-sm font-semibold text-zinc-100">
                Total: ₹{activeTotal.toFixed(2)}
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
                    </View>
                    <Text className="text-base font-semibold text-zinc-100">
                      ₹{e.amount.toFixed(2)}
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
            history.map((rec) => {
              const total = rec.expenses.reduce((s, e) => s + e.amount, 0);
              return (
                <View
                  key={rec.settlementId}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-sm font-semibold text-zinc-100">
                      {new Date(rec.settledAt).toLocaleDateString()}
                    </Text>
                    <Text className="text-xs text-emerald-400">
                      {rec.expenses.length} expenses · ₹{total.toFixed(2)}
                    </Text>
                  </View>
                  <View className="gap-1.5">
                    {rec.expenses.map((e) => (
                      <View key={e._id} className="flex-row justify-between">
                        <Text className="flex-1 text-xs text-zinc-400" numberOfLines={1}>
                          {e.description}
                        </Text>
                        <Text className="text-xs text-zinc-300">
                          ₹{e.amount.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })
          )
        ) : (
          // Report
          !report || report.totalCount === 0 ? (
            <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
              <Text className="text-sm text-zinc-400">No data yet.</Text>
            </View>
          ) : (
            <>
              <View className="flex-row flex-wrap gap-3">
                <ReportStat label="All-time total" value={`₹${report.totalAmount.toFixed(2)}`} />
                <ReportStat label="My share" value={`₹${report.myShare.toFixed(2)}`} />
                <ReportStat label="Expenses" value={String(report.totalCount)} />
                <ReportStat label="Avg / txn" value={`₹${report.averagePerTransaction.toFixed(2)}`} />
              </View>
              {report.byCategory.length > 0 && (
                <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <Text className="mb-3 text-sm font-semibold text-zinc-100">By category</Text>
                  <View className="gap-2">
                    {report.byCategory.map((c) => (
                      <View key={c.category} className="flex-row justify-between">
                        <Text className="text-xs text-zinc-400">{c.category}</Text>
                        <Text className="text-xs font-medium text-zinc-200">
                          ₹{c.total.toFixed(2)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-[45%] flex-1 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Text className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</Text>
      <Text className="mt-1 text-lg font-bold text-zinc-50">{value}</Text>
    </View>
  );
}
