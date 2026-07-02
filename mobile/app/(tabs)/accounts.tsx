import {
 useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { localISODate } from "../../lib/dates";
import type { Account, AccountKind } from "../../lib/types";
import { AppBackground, GradientButton, Input } from "../../components/ui";
import { formatMoney } from "../../lib/currency";

const KINDS: { id: AccountKind; label: string; icon: string }[] = [
  { id: "bank", label: "Bank", icon: "🏦" },
  { id: "cash", label: "Cash", icon: "💵" },
  { id: "card", label: "Card", icon: "💳" },
  { id: "wallet", label: "Wallet", icon: "👛" },
];
const kindMeta = (k: string) => KINDS.find((x) => x.id === k) ?? KINDS[0];

export default function AccountsScreen() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [base, setBase] = useState("INR");
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const load = useCallback(async () => {
    try {
      const [accRes, prefRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/accounts"),
        authFetch("/api/projects/expense-tracker/prefs"),
      ]);
      const accData = await accRes.json().catch(() => ({}));
      const prefData = await prefRes.json().catch(() => ({}));
      setAccounts(accData.accounts ?? []);
      if (prefData.prefs?.baseCurrency) setBase(prefData.prefs.baseCurrency);
    } catch {
      // keep last good state
    }
  }, [authFetch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);

  function confirmDelete(a: Account) {
    Alert.alert("Delete account", `Delete "${a.name}"? Its transactions stay but become unassigned.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await authFetch(`/api/projects/expense-tracker/accounts/${a._id}`, { method: "DELETE" });
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-2xl text-zinc-400">‹</Text>
          </Pressable>
          <Text className="text-xl font-bold text-zinc-50">Accounts</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setShowTransfer(true)}
            disabled={accounts.length < 2}
            className={`rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-1.5 ${accounts.length < 2 ? "opacity-40" : ""}`}
          >
            <Text className="text-xs font-semibold text-zinc-300">⇄ Transfer</Text>
          </Pressable>
          <Pressable onPress={() => setShowAdd(true)} className="rounded-lg bg-brand-600 px-3 py-1.5">
            <Text className="text-xs font-semibold text-white">+ Add</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        <View className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <Text className="text-[13px] uppercase tracking-wider text-zinc-500">Net worth</Text>
          <Text className={`mt-1 text-3xl font-bold ${netWorth < 0 ? "text-red-400" : "text-zinc-50"}`}>
            {formatMoney(netWorth, base)}
          </Text>
          <Text className="mt-0.5 text-xs text-zinc-500">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </Text>
        </View>

        {accounts.length === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
            <Text className="text-sm text-zinc-400">No accounts yet.</Text>
            <Text className="mt-1 text-xs text-zinc-500">Add a bank, cash, card, or wallet.</Text>
          </View>
        ) : (
          accounts.map((a) => {
            const meta = kindMeta(a.kind);
            return (
              <Pressable
                key={a._id}
                onLongPress={() => confirmDelete(a)}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Text className="text-2xl">{meta.icon}</Text>
                    <View>
                      <Text className="font-semibold text-zinc-100">{a.name}</Text>
                      <Text className="text-[11px] uppercase tracking-wider text-zinc-500">{meta.label}</Text>
                    </View>
                  </View>
                  <View className="items-end">
                    <Text className={`text-lg font-bold ${a.balance < 0 ? "text-red-400" : "text-zinc-100"}`}>
                      {formatMoney(a.balance, base)}
                    </Text>
                    <Text className="text-[10px] text-zinc-500">
                      opening {formatMoney(a.openingBalance, base)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
        <Text className="px-1 text-center text-[11px] text-zinc-600">Long-press an account to delete it.</Text>
      </ScrollView>

      <AddAccountModal visible={showAdd} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      <TransferModal
        visible={showTransfer}
        accounts={accounts}
        base={base}
        onClose={() => setShowTransfer(false)}
        onSaved={() => { setShowTransfer(false); load(); }}
      />
    </SafeAreaView>
  );
}

function AddAccountModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const { authFetch } = useAuth();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [opening, setOpening] = useState("0");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return Alert.alert("Name required");
    setSaving(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), kind, openingBalance: parseFloat(opening) || 0 }),
      });
      if (!res.ok) throw new Error("failed");
      setName(""); setOpening("0"); setKind("bank");
      onSaved();
    } catch {
      Alert.alert("Couldn't add account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} title="Add account" onClose={onClose}>
      <Field label="Name">
        <Input value={name} onChangeText={setName} placeholder="e.g. HDFC Savings" placeholderTextColor="#71717a"
          className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
      </Field>
      <Field label="Opening balance">
        <Input value={opening} onChangeText={setOpening} keyboardType="numbers-and-punctuation" placeholderTextColor="#71717a"
          className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
      </Field>
      <Field label="Type">
        <View className="flex-row flex-wrap gap-2">
          {KINDS.map((k) => (
            <Pressable key={k.id} onPress={() => setKind(k.id)}
              className={`rounded-lg border px-3 py-1.5 ${kind === k.id ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`}>
              <Text className={`text-xs font-medium ${kind === k.id ? "text-brand-400" : "text-zinc-400"}`}>{k.icon} {k.label}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <GradientButton label="Add account" onPress={submit} loading={saving} />
    </Sheet>
  );
}

function TransferModal({ visible, accounts, base, onClose, onSaved }: {
  visible: boolean; accounts: Account[]; base: string; onClose: () => void; onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && accounts.length >= 2) {
      setFrom(accounts[0]._id);
      setTo(accounts[1]._id);
    }
  }, [visible, accounts]);

  async function submit() {
    if (from === to) return Alert.alert("Pick two different accounts");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return Alert.alert("Enter a valid amount");
    setSaving(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromAccountId: from, toAccountId: to, amount: amt, date: localISODate() }),
      });
      if (!res.ok) throw new Error("failed");
      setAmount("");
      onSaved();
    } catch {
      Alert.alert("Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible={visible} title={`Transfer (${base})`} onClose={onClose}>
      <Field label="From">
        <AccountPicker accounts={accounts} value={from} onChange={setFrom} base={base} />
      </Field>
      <Field label="To">
        <AccountPicker accounts={accounts} value={to} onChange={setTo} base={base} />
      </Field>
      <Field label="Amount">
        <Input value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor="#71717a"
          className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100" />
      </Field>
      <GradientButton label="Transfer" onPress={submit} loading={saving} />
    </Sheet>
  );
}

function AccountPicker({ accounts, value, onChange, base }: {
  accounts: Account[]; value: string; onChange: (id: string) => void; base: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {accounts.map((a) => (
        <Pressable key={a._id} onPress={() => onChange(a._id)}
          className={`rounded-lg border px-3 py-2 ${value === a._id ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"}`}>
          <Text className={`text-xs font-medium ${value === a._id ? "text-brand-400" : "text-zinc-300"}`}>{a.name}</Text>
          <Text className="text-[10px] text-zinc-500">{formatMoney(a.balance, base)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <Pressable className="rounded-t-3xl border-t border-white/10 bg-[#0a0b14] p-5" onPress={(e) => e.stopPropagation()}>
          <View className="mb-4 flex-row items-center justify-between">
            <Text className="text-base font-semibold text-zinc-100">{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text className="text-sm text-zinc-500">Close</Text></Pressable>
          </View>
          <View className="gap-3">{children}</View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] uppercase tracking-wider text-zinc-500">{label}</Text>
      {children}
    </View>
  );
}
