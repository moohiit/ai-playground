import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  KnownPerson,
  PairBalance,
} from "../../lib/types";
import { AppBackground, GradientButton, Input, KeyboardAwareScreen } from "../../components/ui";
import { GroupReportView } from "../../components/GroupReportView";
import { WEB_BASE_URL } from "../../lib/api";
import { formatMoney } from "../../lib/currency";
import { SPLIT_LABEL } from "../../lib/splits";
import { formatDay } from "../../lib/dates";
import { getBaseCurrency } from "../../lib/prefs";

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
  const [activeMine, setActiveMine] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  // Quick toggle on the Active tab: only rows I carry a share of.
  const [onlyMine, setOnlyMine] = useState(false);
  // Pairwise view: the expenses two members share, and what that leaves
  // between them specifically.
  const [pairA, setPairA] = useState<string | null>(null);
  const [pairB, setPairB] = useState<string | null>(null);
  const [pair, setPair] = useState<PairBalance | null>(null);
  const [baseCurrency, setBaseCurrency] = useState("INR");
  const [history, setHistory] = useState<SettlementRecord[]>([]);
  const [tab, setTab] = useState<Tab>("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [newMember, setNewMember] = useState("");
  // People already sharing a group with you — so adding a flatmate is a tap
  // rather than typing their address again.
  const [people, setPeople] = useState<KnownPerson[]>([]);
  // Suggestions belong to the invite field, so they appear while it has focus
  // and get out of the way otherwise.
  const [memberFocused, setMemberFocused] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [newGuest, setNewGuest] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const cur = dominantCurrency(expenses);
  const money = (n: number) => formatMoney(n, cur);
  // Balances, the settle-up plan and the Active/my-share totals are all
  // base-currency figures (calculateBalances works on amountBase); only the
  // expense rows themselves carry an entry-currency amount. Labelling the
  // former with the group's entry currency showed a base number under a
  // foreign symbol.
  const baseMoney = (n: number) => formatMoney(n, baseCurrency);

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

  // Fetch the pair whenever both ends are chosen. Server-side because the
  // list here is capped at 100 rows and the answer must cover the group.
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

  // Settle-up rows are listed here but are not spending — the Total beside
  // this count excludes them, so the count must too.
  const spendCount = expenses.filter((e) => !e.isSettlement).length;

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
  // The list is fetched with limit=100. In a busier group the count would
  // otherwise read "100" forever while the total beside it covered everything.
  const listTruncated = expenseTotal > expenses.length;
  // With a pair selected the list narrows to what those two share; otherwise
  // it is the group's active window as before.
  const pairExpenses = pair?.expenses ?? [];
  const visibleExpenses = pair ? pairExpenses : expenses;

  /** First tap picks one end, the next picks the other; tapping a chosen
   *  member releases that end so it can be reassigned. */
  function selectPairMember(id: string) {
    if (pairA === id) return setPairA(null);
    if (pairB === id) return setPairB(null);
    if (!pairA) return setPairA(id);
    setPairB(id);
  }

  const fetchAll = useCallback(async () => {
    try {
      const [gRes, bRes, eRes, sRes, hRes] = await Promise.all([
        authFetch(`/api/projects/expense-tracker/groups/${groupId}`),
        authFetch(`/api/projects/expense-tracker/reports/balances/${groupId}`),
        authFetch(
          // includeSettlements: this screen shows settle-up payments as their
          // own badged rows with an Undo action, unlike the global list.
          `/api/projects/expense-tracker/expenses?groupId=${groupId}&limit=100&settled=false&includeSettlements=true${
            onlyMine ? "&mine=true" : ""
          }`
        ),
        authFetch(
          `/api/projects/expense-tracker/reports/summary?groupId=${groupId}&settled=false${
            onlyMine ? "&mine=true" : ""
          }`
        ),
        authFetch(`/api/projects/expense-tracker/groups/${groupId}/history`),
      ]);
      const [g, b, e, s, h] = await Promise.all([
        gRes.json(), bRes.json(), eRes.json(), sRes.json(), hRes.json(),
      ]);
      setGroup(g.group ?? null);
      setPairA((prev) => prev ?? user?.userId ?? null);
      setShareId(g.group?.shareId ?? null);
      setBalances(b.balances ?? []);
      setSettlements(b.settlements ?? []);
      setExpenses(e.expenses ?? []);
      setExpenseTotal(e.total ?? 0);
      setActiveTotal(s.totalAmount ?? 0);
      setActiveMine(s.myShare ?? 0);
      setBaseCurrency(await getBaseCurrency(authFetch));

      const pRes = await authFetch(
        `/api/projects/expense-tracker/people?excludeGroupId=${groupId}`
      );
      if (pRes.ok) {
        const pData = await pRes.json().catch(() => ({}));
        setPeople(pData.people ?? []);
      }
      setHistory(h.history ?? []);
    } catch {
      // keep last good state
    }
  }, [groupId, onlyMine, authFetch]);

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

  const [reopening, setReopening] = useState(false);

  function confirmReopen(rec: SettlementRecord) {
    const count = rec.expenses.length;
    const total = rec.expenses.reduce(
      (sum, e) => sum + (e.amountBase ?? e.amount),
      0
    );
    Alert.alert(
      "Reopen this settlement",
      `${count} ${count === 1 ? "expense" : "expenses"} worth ${formatMoney(
        total,
        baseCurrency
      )} go back to Active, and the settle-up payments recorded at the time are restored.${
        (rec.transfers?.length ?? 0) > 0
          ? `\n\n${rec.transfers!.length} payment${
              rec.transfers!.length === 1 ? "" : "s"
            } will reappear as settlement rows.`
          : ""
      }\n\nEveryone in the group is notified.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reopen",
          style: "destructive",
          onPress: async () => {
            setReopening(true);
            try {
              const res = await authFetch(
                `/api/projects/expense-tracker/groups/${groupId}/reopen`,
                { method: "POST" }
              );
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                Alert.alert("Couldn't reopen", data.error ?? "Try again.");
                return;
              }
              setTab("active");
              await fetchAll();
            } catch {
              Alert.alert("Error", "Network error — nothing was reopened.");
            } finally {
              setReopening(false);
            }
          },
        },
      ]
    );
  }

  // Record an individual "X paid Y" settlement payment for one transfer row.
  const [payingKey, setPayingKey] = useState<string | null>(null);

  function confirmSettlePayment(s: Settlement) {
    Alert.alert(
      "Record payment",
      `${s.from.name} paid ${s.to.name} ${baseMoney(s.amount)}?\n\nTheir balances offset and this row disappears.${
        settlements.length === 1
          ? " This is the last outstanding transfer, so the active expenses will move to settled history."
          : " Original expenses stay untouched."
      }`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record",
          onPress: async () => {
            const rowKey = `${s.from.id}→${s.to.id}`;
            setPayingKey(rowKey);
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
                Alert.alert("Error", data.error ?? "Couldn't record the payment");
                return;
              }
              if (data.autoSettled) {
                Alert.alert(
                  "All square",
                  `That was the last payment — ${data.settlement?.expenseCount ?? 0} expenses moved to settled history.`
                );
              }
              fetchAll();
            } catch {
              Alert.alert("Error", "Network error — payment not recorded.");
            } finally {
              setPayingKey(null);
            }
          },
        },
      ]
    );
  }

  const [renameVisible, setRenameVisible] = useState(false);
  const [renameText, setRenameText] = useState("");
  const [renaming, setRenaming] = useState(false);

  async function handleRename() {
    if (renaming) return;
    const name = renameText.trim();
    if (!name) return Alert.alert("Enter a group name");
    setRenaming(true);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/groups/${groupId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Error", data.error ?? "Couldn't rename the group");
        return;
      }
      setRenameVisible(false);
      fetchAll();
    } catch {
      Alert.alert("Error", "Network error — group not renamed.");
    } finally {
      setRenaming(false);
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
        <Pressable
          className="flex-1 flex-row items-center justify-center gap-1.5 px-3"
          disabled={user?.userId !== group?.createdBy}
          onPress={() => {
            setRenameText(group?.name ?? "");
            setRenameVisible(true);
          }}
        >
          <Text className="text-center text-base font-semibold text-zinc-100" numberOfLines={1}>
            {group?.name ?? "Group"}
          </Text>
          {user?.userId === group?.createdBy && (
            <Text className="text-xs text-zinc-500">✎</Text>
          )}
        </Pressable>
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
                          {net > 0 ? "+" : ""}{baseMoney(net)}
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
                  onFocus={() => setMemberFocused(true)}
                  // Delayed so a tap on a suggestion lands before the list
                  // unmounts — otherwise the blur removes it mid-press.
                  onBlur={() => setTimeout(() => setMemberFocused(false), 150)}
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

              {/* Suggestions narrow as you type, so the field still accepts
                  an address nobody in your groups has. */}
              {memberFocused && suggestions.length > 0 && (
                <View className="mt-1 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/80">
                  {suggestions.map((p, i) => (
                    <Pressable
                      key={p.userId}
                      onPress={() => {
                        setNewMember(p.email);
                        setMemberFocused(false);
                      }}
                      className={`flex-row items-center justify-between px-3 py-2.5 ${
                        i > 0 ? "border-t border-white/5" : ""
                      }`}
                    >
                      <View className="flex-1">
                        <Text className="text-[13px] text-zinc-200">{p.name}</Text>
                        <Text className="text-[11px] text-zinc-500" numberOfLines={1}>
                          {p.email}
                        </Text>
                      </View>
                      <Text className="text-[11px] text-zinc-600">
                        {p.sharedGroups} shared
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

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
                  {settlements.map((s) => {
                    const rowKey = `${s.from.id}→${s.to.id}`;
                    return (
                      <View
                        // A minimal-transfer plan never repeats a payer→payee pair.
                        key={rowKey}
                        className="flex-row items-center gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-3 py-2"
                      >
                        <Text className="shrink text-sm text-red-400" numberOfLines={1}>
                          {s.from.name}
                        </Text>
                        <Text className="text-zinc-500">→</Text>
                        <Text className="shrink text-sm text-emerald-400" numberOfLines={1}>
                          {s.to.name}
                        </Text>
                        <Text className="ml-auto text-sm text-zinc-100">
                          {baseMoney(s.amount)}
                        </Text>
                        <Pressable
                          onPress={() => confirmSettlePayment(s)}
                          disabled={payingKey !== null}
                          className={`rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 ${
                            payingKey !== null ? "opacity-50" : ""
                          }`}
                        >
                          <Text className="text-[11px] font-semibold text-emerald-300">
                            {payingKey === rowKey ? "…" : "Settle"}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
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
                        {baseMoney(b.totalPaid)}
                      </Text>
                      <Text style={{ width: 58 }} className="text-right text-[13px] text-zinc-300">
                        {baseMoney(b.totalOwed)}
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
                        {b.netBalance > 0 ? "+" : ""}{baseMoney(b.netBalance)}
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
            {/* Between two members */}
            {(group?.members.filter((m) => m.isActive).length ?? 0) > 1 && (
              <View className="gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <Text className="text-[12px] uppercase tracking-wider text-zinc-500">
                  Between two members
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {group!.members
                    .filter((m) => m.isActive)
                    .map((m) => {
                      const isA = pairA === m.userId;
                      const isB = pairB === m.userId;
                      return (
                        <Pressable
                          key={m.userId}
                          onPress={() => selectPairMember(m.userId)}
                          className={`rounded-lg border px-2.5 py-1.5 ${
                            isA
                              ? "border-brand-500/60 bg-brand-500/15"
                              : isB
                                ? "border-emerald-500/50 bg-emerald-500/15"
                                : "border-white/10 bg-zinc-900/40"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              isA
                                ? "text-brand-300"
                                : isB
                                  ? "text-emerald-300"
                                  : "text-zinc-400"
                            }`}
                          >
                            {m.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                {pair ? (
                  <View className="gap-1 border-t border-white/5 pt-2">
                    <Text className="text-sm text-zinc-300">
                      {pair.expenseCount}{" "}
                      {pair.expenseCount === 1 ? "expense" : "expenses"} together
                      · {baseMoney(pair.total)}
                    </Text>
                    <Text className="text-[12px] text-zinc-500">
                      {pair.memberA.name} {baseMoney(pair.shareA)} ·{" "}
                      {pair.memberB.name} {baseMoney(pair.shareB)}
                    </Text>
                    <Text
                      className={`mt-1 text-base font-bold ${
                        Math.abs(pair.net) < 0.01
                          ? "text-zinc-400"
                          : "text-emerald-300"
                      }`}
                    >
                      {Math.abs(pair.net) < 0.01
                        ? "They're square"
                        : pair.net > 0
                          ? `${pair.memberB.name} owes ${pair.memberA.name} ${baseMoney(pair.net)}`
                          : `${pair.memberA.name} owes ${pair.memberB.name} ${baseMoney(-pair.net)}`}
                    </Text>
                    {/* The group plan nets debts through other people, so it
                        can differ from what is directly between two members. */}
                    <Text className="text-[11px] text-zinc-600">
                      Only expenses one of them paid for the other. The Settle Up
                      plan above may route this through someone else.
                    </Text>
                  </View>
                ) : (
                  <Text className="text-[12px] text-zinc-500">
                    Tap two members to see what they have between them.
                  </Text>
                )}
              </View>
            )}

            <View className="flex-row items-start justify-between">
              <View className="flex-1 gap-2">
                <View className="flex-row items-center gap-2">
                  <Text className="text-sm font-semibold text-zinc-100">
                    {pair
                      ? `Shared expenses (${pairExpenses.length})`
                      : `Active Expenses (${spendCount}${
                          listTruncated ? ` of ${expenseTotal}` : ""
                        })`}
                  </Text>
                  {/* Settling was only reachable from the Settle Up panel,
                      which is hidden once every balance is square — leaving a
                      group that had already paid each other back with no way
                      to close the window. */}
                  {settlements.length === 0 && spendCount > 0 && (
                    <Pressable
                      onPress={handleSettle}
                      disabled={settling}
                      className={`rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 ${
                        settling ? "opacity-60" : ""
                      }`}
                    >
                      <Text className="text-[12px] font-semibold text-amber-300">
                        {settling ? "Settling…" : "Mark all settled"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Pressable
                  onPress={() => setOnlyMine((v) => !v)}
                  hitSlop={6}
                  className={`self-start rounded-lg border px-2.5 py-1 ${
                    onlyMine
                      ? "border-emerald-500/50 bg-emerald-500/15"
                      : "border-white/10 bg-zinc-900/40"
                  }`}
                >
                  <Text
                    className={`text-[12px] font-medium ${
                      onlyMine ? "text-emerald-300" : "text-zinc-400"
                    }`}
                  >
                    {onlyMine ? "✓ Only mine" : "Only mine"}
                  </Text>
                </Pressable>
              </View>
              <View className="items-end">
                <Text className="text-sm font-semibold text-indigo-300">
                  Total: {baseMoney(activeTotal)}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  <View
                    style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#34d399" }}
                  />
                  <Text className="text-[13px] font-semibold text-emerald-300">
                    {baseMoney(activeMine)}
                  </Text>
                  <Text className="text-[11px] text-zinc-500">mine</Text>
                </View>
              </View>
            </View>

            {visibleExpenses.length === 0 ? (
              <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-10">
                <Text className="text-sm text-zinc-400">
                  {onlyMine
                    ? "No active expenses include you."
                    : "All cleared! No unsettled expenses."}
                </Text>
              </View>
            ) : (
              visibleExpenses.map((e) => (
                <View
                  key={e._id}
                  className={`rounded-2xl border p-4 ${
                    e.isSettlement
                      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="shrink font-medium text-zinc-100" numberOfLines={1}>
                          {e.isSettlement ? "↔ " : ""}{e.description}
                        </Text>
                        {e.isSettlement && (
                          <Text className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] uppercase text-emerald-400">
                            settlement
                          </Text>
                        )}
                      </View>
                      {/* A settle-up row's `date` is the instant it was
                          recorded (recordSettlementPayment writes new Date()),
                          so it renders in local time; a real expense's date is
                          the UTC-midnight day the user picked. */}
                      <Text className="mt-0.5 text-xs text-zinc-500">
                        {e.isSettlement
                          ? `Recorded ${new Date(e.date).toLocaleDateString()}`
                          : `Paid by ${e.paidBy.name} · ${formatDay(e.date)} · split ${e.splitAmong?.length ?? 0} ways${
                              e.splitMode && e.splitMode !== "equal"
                                ? ` (${SPLIT_LABEL[e.splitMode]})`
                                : ""
                            }`}
                      </Text>
                      {!e.isSettlement && e.splitAmong && e.splitAmong.length > 0 && (
                        <Text className="mt-0.5 text-[13px] text-zinc-600" numberOfLines={2}>
                          Split: {e.splitAmong.map((m) => m.name).join(", ")}
                        </Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-base font-semibold text-zinc-100">
                        {money(e.amount)}
                      </Text>
                      {!e.isSettlement && (
                        <Text
                          className={`mt-0.5 text-[13px] font-semibold ${
                            rowShare(e, user?.userId) > 0
                              ? "text-emerald-300"
                              : "text-zinc-600"
                          }`}
                        >
                          {rowShare(e, user?.userId) > 0
                            ? `${money(rowShare(e, user?.userId))} mine`
                            : "not yours"}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View className="mt-3 flex-row justify-end gap-4 border-t border-white/5 pt-3">
                    {!e.isSettlement && (
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
                    )}
                    <Pressable hitSlop={8} onPress={() => handleDelete(e)}>
                      <Text className="text-xs font-medium text-red-400">
                        {e.isSettlement ? "Undo" : "Delete"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            {listTruncated && !pair && (
              <Text className="px-1 text-center text-[12px] text-zinc-500">
                Showing the {expenses.length} most recent of {expenseTotal}.
                Open Reports for the full picture.
              </Text>
            )}

            {/* Creating and revoking the public link is creator-only on the
                server, so offering it to every member only produced a refusal
                they could not act on. Members can still open an existing link. */}
            {(user?.userId === group?.createdBy || shareId) && (
              <Pressable
                onPress={shareSplit}
                className="mt-2 items-center rounded-xl border border-brand-500/30 bg-brand-500/10 py-3"
              >
                <Text className="text-sm font-medium text-white">
                  {shareId ? "🔗 Share split link" : "Share split (create link)"}
                </Text>
              </Pressable>
            )}
            {shareId && user?.userId === group?.createdBy && (
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
            history.map((rec, i) => (
              <SettlementCard
                key={rec.settlementId}
                record={rec}
                baseCurrency={baseCurrency}
                // Only the newest batch can go back — reviving an older one
                // while newer settlements exist would interleave two closed
                // periods into one active window.
                onReopen={i === 0 ? () => confirmReopen(rec) : undefined}
                reopening={reopening}
              />
            ))
          )
        ) : (
          <GroupReportView groupId={groupId} groupName={group?.name ?? "Group"} />
        )}
      </KeyboardAwareScreen>

      {/* Rename group */}
      <Modal
        visible={renameVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setRenameVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View className="flex-1 justify-end bg-black/60">
            <View className="rounded-t-3xl border-t border-white/10 bg-zinc-950 px-5 pb-10 pt-5">
              <Text className="mb-4 text-base font-bold text-zinc-100">
                Rename group
              </Text>
              <Input
                value={renameText}
                onChangeText={setRenameText}
                placeholder="Group name"
                autoFocus
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
              />
              <View className="mt-4 gap-2">
                <GradientButton
                  label="Save name"
                  onPress={handleRename}
                  loading={renaming}
                />
                <Pressable
                  onPress={() => setRenameVisible(false)}
                  className="items-center py-2"
                >
                  <Text className="text-sm text-zinc-500">Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/** What one group row costs the viewer — their slice of the split, 0 when the
 *  split leaves them out. Amounts here are already in the group's currency. */
function rowShare(e: Expense, userId?: string): number {
  if (!userId) return 0;
  return e.splits?.find((sp) => sp.memberId === userId)?.amount ?? 0;
}

/** Per-member Paid / Share / Net for a settled batch (mirrors the web summary). */
function settlementMembers(expenses: Expense[]) {
  const map = new Map<string, { id: string; name: string; paid: number; share: number }>();
  for (const e of expenses) {
    // Base-currency figures, matching calculateBalances — splits are stored in
    // the entry currency, so scale them by the same base/entry ratio.
    const baseAmt = e.amountBase ?? e.amount;
    const ratio = e.amount > 0 ? baseAmt / e.amount : 1;
    const pid = e.paidBy?.id ?? e.paidBy?.name ?? "?";
    if (!map.has(pid)) map.set(pid, { id: pid, name: e.paidBy?.name ?? "-", paid: 0, share: 0 });
    map.get(pid)!.paid += baseAmt;
    for (const s of e.splits ?? []) {
      if (!map.has(s.memberId)) map.set(s.memberId, { id: s.memberId, name: s.name, paid: 0, share: 0 });
      map.get(s.memberId)!.share += s.amount * ratio;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.paid - b.share - (a.paid - a.share)
  );
}

/** Minimal-transfer plan for a settled batch, recomputed from Paid − Share
 *  (greedy largest-creditor/largest-debtor matching — same as active settle). */
function settlementPlan(
  members: { id: string; name: string; paid: number; share: number }[]
) {
  const creditors = members
    .filter((m) => m.paid - m.share > 0.01)
    .map((m) => ({ name: m.name, amt: m.paid - m.share }))
    .sort((a, b) => b.amt - a.amt);
  const debtors = members
    .filter((m) => m.share - m.paid > 0.01)
    .map((m) => ({ name: m.name, amt: m.share - m.paid }))
    .sort((a, b) => b.amt - a.amt);
  const plan: { from: string; to: string; amount: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const x = Math.min(debtors[i].amt, creditors[j].amt);
    plan.push({
      from: debtors[i].name,
      to: creditors[j].name,
      amount: Math.round(x * 100) / 100,
    });
    debtors[i].amt -= x;
    creditors[j].amt -= x;
    if (debtors[i].amt < 0.01) i++;
    if (creditors[j].amt < 0.01) j++;
  }
  return plan;
}

function SettlementCard({
  record,
  baseCurrency,
  onReopen,
  reopening,
}: {
  record: SettlementRecord;
  baseCurrency: string;
  onReopen?: () => void;
  reopening?: boolean;
}) {
  const total = record.expenses.reduce((s, e) => s + (e.amountBase ?? e.amount), 0);
  const members = settlementMembers(record.expenses);
  const totalShare = members.reduce((s, m) => s + m.share, 0);
  const plan = settlementPlan(members);
  // Every figure in this card is base-currency (see settlementMembers), so it
  // is labelled with the viewer's base rather than the batch's entry currency.
  const money = (n: number) => formatMoney(n, baseCurrency);
  const settledVia =
    record.transfers && record.transfers.length > 0
      ? record.transfers.map((t) => ({
          from: t.from.name,
          to: t.to.name,
          amount: t.amount,
        }))
      : plan;

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
        <View className="flex-row items-center gap-3">
          <Text className="text-xs text-emerald-400">
            {record.expenses.length} expenses · {money(total)}
          </Text>
          {onReopen && (
            <Pressable
              onPress={onReopen}
              disabled={reopening}
              hitSlop={6}
              className={`rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 ${
                reopening ? "opacity-50" : ""
              }`}
            >
              <Text className="text-[12px] font-semibold text-amber-300">
                {reopening ? "…" : "Reopen"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Who paid whom in this settlement. Batches closed after settle-up
          payments were tracked carry the real transfers; older ones fall back
          to the plan recomputed from Paid − Share. */}
      {settledVia.length > 0 && (
        <View className="mb-3 gap-1.5">
          <Text className="text-[11px] uppercase tracking-wider text-amber-400/90">
            Settled via
          </Text>
          {settledVia.map((p, i) => (
            <View
              key={`${p.from}→${p.to}-${i}`}
              className="flex-row items-center justify-between gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-3 py-2"
            >
              <Text className="flex-1 text-xs" numberOfLines={1}>
                <Text className="text-red-400">{p.from}</Text>
                <Text className="text-zinc-600"> → </Text>
                <Text className="text-emerald-400">{p.to}</Text>
              </Text>
              <Text className="text-xs font-semibold text-zinc-200">
                {money(p.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

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
                Paid by {e.paidBy.name} · {formatDay(e.date)}
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
