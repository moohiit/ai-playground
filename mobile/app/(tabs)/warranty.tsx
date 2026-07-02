import {
 useCallback, useState } from "react";
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
import { AppBackground, GradientButton, Input } from "../../components/ui";
import { formatMoney } from "../../lib/currency";

type WarrantyEntry = {
  _id: string;
  label: string;
  purchaseDate: string;
  returnByDate: string | null;
  warrantyExpiresAt: string | null;
  notes: string;
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

const EMPTY = {
  label: "",
  purchaseDate: new Date().toISOString().slice(0, 10),
  returnByDate: "",
  warrantyExpiresAt: "",
  notes: "",
};

export default function WarrantyScreen() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<WarrantyEntry[]>([]);
  const [receipts, setReceipts] = useState<ReceiptExpense[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wRes, rRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/warranty"),
        authFetch("/api/projects/expense-tracker/warranty?receipts=1"),
      ]);
      setItems((await wRes.json().catch(() => ({}))).warranties ?? []);
      setReceipts((await rRes.json().catch(() => ({}))).expenses ?? []);
    } catch {
      /* keep */
    }
  }, [authFetch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleAdd() {
    if (saving) return;
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await authFetch("/api/projects/expense-tracker/warranty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label.trim(),
          purchaseDate: form.purchaseDate,
          returnByDate: form.returnByDate || null,
          warrantyExpiresAt: form.warrantyExpiresAt || null,
          notes: form.notes,
        }),
      });
      setForm({ ...EMPTY });
      setShowAdd(false);
      load();
    } catch {
      Alert.alert("Error", "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(expenseId: string, desc: string) {
    if (saving) return;
    setSaving(true);
    try {
      await doImport(expenseId, desc);
    } catch {
      Alert.alert("Error", "Network error — nothing was imported.");
    } finally {
      setSaving(false);
    }
  }

  async function doImport(expenseId: string, desc: string) {
    const res = await authFetch(
      "/api/projects/expense-tracker/warranty/from-expense",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId }),
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      Alert.alert(
        "Imported",
        `Added ${data.created} item(s) from "${desc}"${data.skipped ? `. ${data.skipped} already tracked.` : "."}`
      );
      setShowImport(false);
      load();
    } else {
      Alert.alert("Error", data.error ?? "Import failed");
    }
  }

  function confirmDelete(w: WarrantyEntry) {
    Alert.alert("Delete", `Delete "${w.label}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await authFetch(
            `/api/projects/expense-tracker/warranty/${w._id}`,
            { method: "DELETE" }
          );
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
          <Text className="text-xl font-bold text-zinc-50">Warranties</Text>
        </View>
        <View className="flex-row gap-2">
          {receipts.length > 0 && (
            <Pressable
              onPress={() => setShowImport(true)}
              className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5"
            >
              <Text className="text-xs font-medium text-zinc-300">📥 Receipt</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => setShowAdd(true)}
            className="rounded-lg border border-brand-500/50 bg-brand-500/10 px-3 py-1.5"
          >
            <Text className="text-xs font-semibold text-brand-400">+ Add</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {items.length === 0 ? (
          <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-14">
            <Text className="text-4xl">🛡️</Text>
            <Text className="mt-3 text-sm text-zinc-400">
              No warranty entries yet
            </Text>
            <Text className="mt-1 text-xs text-zinc-600">
              Add items or import from a scanned receipt
            </Text>
          </View>
        ) : (
          items.map((w) => (
            <WarrantyCard key={w._id} w={w} onDelete={() => confirmDelete(w)} />
          ))
        )}
      </ScrollView>

      {/* Add modal */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="rounded-t-3xl border-t border-white/10 bg-zinc-950 px-5 pb-10 pt-5">
            <Text className="mb-4 text-base font-bold text-zinc-100">
              New warranty entry
            </Text>
            <View className="gap-3">
              <LabeledInput
                label="Item name *"
                value={form.label}
                onChange={(v) => setForm((f) => ({ ...f, label: v }))}
                placeholder="e.g. Laptop, iPhone case"
              />
              <LabeledInput
                label="Purchase date *"
                value={form.purchaseDate}
                onChange={(v) => setForm((f) => ({ ...f, purchaseDate: v }))}
                placeholder="YYYY-MM-DD"
              />
              <LabeledInput
                label="Return by (optional)"
                value={form.returnByDate}
                onChange={(v) => setForm((f) => ({ ...f, returnByDate: v }))}
                placeholder="YYYY-MM-DD"
              />
              <LabeledInput
                label="Warranty expires (optional)"
                value={form.warrantyExpiresAt}
                onChange={(v) =>
                  setForm((f) => ({ ...f, warrantyExpiresAt: v }))
                }
                placeholder="YYYY-MM-DD"
              />
              <LabeledInput
                label="Notes (optional)"
                value={form.notes}
                onChange={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="Store name, serial number…"
              />
            </View>
            <View className="mt-5 gap-2">
              <GradientButton
                label="Save"
                onPress={handleAdd}
                loading={saving}
              />
              <Pressable
                onPress={() => {
                  setShowAdd(false);
                  setForm({ ...EMPTY });
                }}
                className="items-center py-2"
              >
                <Text className="text-sm text-zinc-500">Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import from receipt modal */}
      <Modal visible={showImport} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/60">
          <View className="max-h-[70%] rounded-t-3xl border-t border-white/10 bg-zinc-950 px-5 pb-10 pt-5">
            <Text className="mb-4 text-base font-bold text-zinc-100">
              Import from receipt
            </Text>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {receipts.map((r) => (
                <Pressable
                  key={r._id}
                  onPress={() => handleImport(r._id, r.description)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <Text className="font-medium text-zinc-100">
                    {r.description}
                  </Text>
                  <Text className="mt-0.5 text-xs text-zinc-500">
                    {new Date(r.date).toLocaleDateString()} ·{" "}
                    {r.itemCount} item{r.itemCount !== 1 ? "s" : ""}:{" "}
                    {r.itemNames.slice(0, 3).join(", ")}
                    {r.itemNames.length > 3 ? "…" : ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setShowImport(false)}
              className="mt-4 items-center py-2"
            >
              <Text className="text-sm text-zinc-500">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="font-semibold text-zinc-100">{w.label}</Text>
          <Text className="mt-0.5 text-xs text-zinc-500">
            Bought {new Date(w.purchaseDate).toLocaleDateString()}
            {w.notes ? ` · ${w.notes}` : ""}
          </Text>
        </View>
        <Pressable onPress={onDelete} hitSlop={8}>
          <Text className="text-xs text-zinc-600">✕</Text>
        </Pressable>
      </View>

      <View className="mt-3 flex-row flex-wrap gap-2">
        {w.returnByDate && (
          <CountdownBadge
            label="Return"
            days={w.daysUntilReturn}
            status={w.returnStatus}
            date={w.returnByDate}
          />
        )}
        {w.warrantyExpiresAt && (
          <CountdownBadge
            label="Warranty"
            days={w.daysUntilWarranty}
            status={w.warrantyStatus}
            date={w.warrantyExpiresAt}
          />
        )}
        {!w.returnByDate && !w.warrantyExpiresAt && (
          <View className="rounded-full border border-zinc-700/50 bg-zinc-800/50 px-3 py-1">
            <Text className="text-xs text-zinc-500">No dates set</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CountdownBadge({
  label,
  days,
  status,
  date,
}: {
  label: string;
  days: number | null;
  status: string | null;
  date: string;
}) {
  const isExpired =
    status === "missed-return" || status === "warranty-expired";
  const isSoon =
    status === "return-soon" || status === "warranty-soon";

  const borderColor = isExpired
    ? "border-red-500/40"
    : isSoon
    ? "border-amber-500/40"
    : "border-emerald-500/30";
  const bgColor = isExpired
    ? "bg-red-500/10"
    : isSoon
    ? "bg-amber-500/10"
    : "bg-emerald-500/5";
  const textColor = isExpired
    ? "text-red-400"
    : isSoon
    ? "text-amber-300"
    : "text-emerald-400";

  const countdown =
    days === null
      ? ""
      : days < 0
      ? ` · ${Math.abs(days)}d ago`
      : days === 0
      ? " · today!"
      : ` · ${days}d`;

  return (
    <View
      className={`rounded-full border ${borderColor} ${bgColor} px-3 py-1`}
    >
      <Text className={`text-xs font-medium ${textColor}`}>
        {label}: {new Date(date).toLocaleDateString()}{countdown}
      </Text>
    </View>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </Text>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#52525b"
        className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
      />
    </View>
  );
}
