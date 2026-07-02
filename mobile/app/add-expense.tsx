import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../lib/auth";
import {
  CATEGORIES,
  INCOME_CATEGORIES,
  type Account,
  type Direction,
  type Expense,
  type Group,
} from "../lib/types";
import { SUPPORTED_CURRENCIES } from "../lib/currency";
import {
  AppBackground,
  GradientButton,
  Input,
  KeyboardAwareScreen,
} from "../components/ui";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function AddExpenseScreen() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ expense?: string; groupId?: string; prefill?: string }>();

  const editExpense = useMemo<Expense | null>(() => {
    if (!params.expense) return null;
    try {
      return JSON.parse(params.expense) as Expense;
    } catch {
      return null;
    }
  }, [params.expense]);
  // A draft (e.g. parsed from natural language) to pre-populate a NEW entry.
  const pre = useMemo<Partial<Expense> | null>(() => {
    if (!params.prefill) return null;
    try {
      return JSON.parse(params.prefill) as Partial<Expense>;
    } catch {
      return null;
    }
  }, [params.prefill]);
  const isEdit = !!editExpense;
  const preGroupId = typeof params.groupId === "string" ? params.groupId : "";

  const [direction, setDirection] = useState<Direction>(
    editExpense?.direction ?? pre?.direction ?? "expense"
  );
  const [type, setType] = useState<"personal" | "group">(
    editExpense?.type ?? pre?.type ?? (preGroupId ? "group" : "personal")
  );
  const categoryList = direction === "income" ? INCOME_CATEGORIES : CATEGORIES;

  function changeDirection(d: Direction) {
    setDirection(d);
    if (d === "income") {
      setType("personal");
      setCategory((c) =>
        (INCOME_CATEGORIES as readonly string[]).includes(c)
          ? c
          : INCOME_CATEGORIES[0]
      );
    } else {
      setCategory((c) =>
        (CATEGORIES as readonly string[]).includes(c) ? c : CATEGORIES[0]
      );
    }
  }
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState(editExpense?.groupId ?? preGroupId ?? "");
  const [paidById, setPaidById] = useState(
    editExpense?.paidBy?.id ?? user?.userId ?? ""
  );
  const [paidByName, setPaidByName] = useState(editExpense?.paidBy?.name ?? "");
  const [amount, setAmount] = useState(
    editExpense ? String(editExpense.amount) : pre?.amount != null ? String(pre.amount) : ""
  );
  const [currency, setCurrency] = useState(editExpense?.currency ?? pre?.currency ?? "INR");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>(editExpense?.accountId ?? "");
  const [description, setDescription] = useState(editExpense?.description ?? pre?.description ?? "");
  const [category, setCategory] = useState<string>(
    editExpense?.category ?? pre?.category ?? CATEGORIES[0]
  );
  const [date, setDate] = useState(
    editExpense
      ? new Date(editExpense.date).toISOString().slice(0, 10)
      : pre?.date ?? todayISO()
  );
  const [present, setPresent] = useState<Set<string>>(
    () => new Set(editExpense?.splitAmong?.map((m) => m.memberId) ?? [])
  );
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []))
      .catch(() => {});
  }, [authFetch]);

  // Default a new entry's currency to the user's base currency (unless prefilled).
  useEffect(() => {
    if (isEdit || pre?.currency) return;
    authFetch("/api/projects/expense-tracker/prefs")
      .then((r) => r.json())
      .then((d) => d.prefs?.baseCurrency && setCurrency(d.prefs.baseCurrency))
      .catch(() => {});
  }, [authFetch, isEdit, pre?.currency]);

  // Load accounts so personal entries can be assigned to a wallet.
  useEffect(() => {
    authFetch("/api/projects/expense-tracker/accounts")
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .catch(() => {});
  }, [authFetch]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g._id === groupId),
    [groups, groupId]
  );

  useEffect(() => {
    if (!selectedGroup) return;
    // Only auto-select all members when creating; never clobber a saved split.
    if (!isEdit) {
      setPresent(
        new Set(
          selectedGroup.members.filter((m) => m.isActive).map((m) => m.userId)
        )
      );
    }
    if (!paidById && selectedGroup.members.length > 0) {
      setPaidById(selectedGroup.members[0].userId);
      setPaidByName(selectedGroup.members[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup]);

  function toggleMember(memberId: string) {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  async function pickAndScan(source: "camera" | "library") {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError("Permission denied for " + source);
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.7,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];

      setScanning(true);
      setError(null);
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "receipt.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);

      const res = await authFetch("/api/projects/expense-tracker/scan", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      const r = data.result;
      if (r.total != null) setAmount(String(r.total));
      if (r.vendor) setDescription(r.vendor);
      if (r.category) setCategory(r.category);
      if (r.date) setDate(r.date);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function onScanPress() {
    Alert.alert("Scan receipt", "Choose a source", [
      { text: "Camera", onPress: () => pickAndScan("camera") },
      { text: "Photo library", onPress: () => pickAndScan("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function handleSave() {
    if (saving) return;
    setError(null);
    const amt = parseFloat(amount);
    const effectiveType = direction === "income" ? "personal" : type;
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    if (!description.trim()) return setError("Enter a description");
    if (effectiveType === "group" && !groupId) return setError("Select a group");
    // Saving a group expense before the groups fetch resolves would silently
    // replace the real payer with the current user and drop the saved split
    // (both are derived from selectedGroup below). Block until it's loaded.
    if (effectiveType === "group" && !selectedGroup) {
      return setError("Group details are still loading — try again in a second");
    }

    setSaving(true);
    try {
      const splitAmong =
        effectiveType === "group" && selectedGroup
          ? selectedGroup.members
              .filter((m) => present.has(m.userId))
              .map((m) => ({ memberId: m.userId, name: m.name }))
          : undefined;

      const payer =
        effectiveType === "group" && selectedGroup
          ? {
              id: paidById,
              name:
                selectedGroup.members.find((m) => m.userId === paidById)?.name ??
                paidByName,
            }
          : { id: user?.userId, name: user?.name || paidByName || "Me" };

      const url = isEdit
        ? `/api/projects/expense-tracker/expenses/${editExpense!._id}`
        : "/api/projects/expense-tracker/expenses";

      const res = await authFetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: effectiveType,
          direction,
          currency,
          accountId: effectiveType === "personal" ? accountId || null : null,
          groupId: effectiveType === "group" ? groupId : undefined,
          paidBy: payer,
          amount: amt,
          description: description.trim(),
          category,
          date,
          splitAmong,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm text-zinc-400">← Cancel</Text>
        </Pressable>
        <Text className="text-base font-semibold text-zinc-100">
          {isEdit ? "Edit Expense" : "Add Expense"}
        </Text>
        <View style={{ width: 52 }} />
      </View>

      <KeyboardAwareScreen
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      >
          <View className="flex-row gap-2">
            {(
              [
                ["expense", "Expense"],
                ["income", "Income"],
              ] as const
            ).map(([d, label]) => {
              const on = direction === d;
              return (
                <Pressable
                  key={d}
                  onPress={() => changeDirection(d)}
                  className={`flex-1 items-center rounded-xl border py-2.5 ${
                    on
                      ? d === "income"
                        ? "border-emerald-500/60 bg-emerald-500/15"
                        : "border-brand-500/60 bg-brand-500/15"
                      : "border-white/10 bg-zinc-900/40"
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      on
                        ? d === "income"
                          ? "text-emerald-400"
                          : "text-brand-400"
                        : "text-zinc-400"
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {!isEdit && direction === "expense" && (
            <Pressable
              onPress={onScanPress}
              disabled={scanning}
              className="items-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-5"
            >
              {scanning ? (
                <ActivityIndicator color="#6366f1" />
              ) : (
                <Text className="text-2xl">📷</Text>
              )}
              <Text className="mt-2 text-sm font-medium text-zinc-200">
                {scanning ? "Scanning receipt…" : "Scan receipt"}
              </Text>
              <Text className="mt-0.5 text-[12px] uppercase tracking-wider text-zinc-500">
                Auto-fill with Gemini Vision
              </Text>
            </Pressable>
          )}

          {direction === "expense" && (
            <View className="flex-row gap-2">
              {(["personal", "group"] as const).map((t) => (
                <Pressable
                  key={t}
                  onPress={() => setType(t)}
                  className={`flex-1 items-center rounded-xl border py-2.5 ${
                    type === t
                      ? "border-brand-500/60 bg-brand-500/15"
                      : "border-white/10 bg-zinc-900/40"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium capitalize ${
                      type === t ? "text-brand-400" : "text-zinc-400"
                    }`}
                  >
                    {t}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {direction === "expense" && type === "group" && (
            <View className="gap-3">
              <Field label="Group">
                {groups.length === 0 ? (
                  <Text className="text-xs text-zinc-500">
                    No groups yet — create one in the Groups tab first.
                  </Text>
                ) : (
                  <View className="gap-2">
                    {groups.map((g) => (
                      <Pressable
                        key={g._id}
                        onPress={() => setGroupId(g._id)}
                        className={`rounded-lg border px-3 py-2 ${
                          groupId === g._id
                            ? "border-brand-500/60 bg-brand-500/10"
                            : "border-white/10 bg-zinc-950/50"
                        }`}
                      >
                        <Text
                          className={
                            groupId === g._id ? "text-brand-300" : "text-zinc-300"
                          }
                        >
                          {g.name}{" "}
                          <Text className="text-xs text-zinc-500">
                            ({g.members.length})
                          </Text>
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </Field>

              {selectedGroup && (
                <>
                  <Field label="Paid by">
                    <View className="flex-row flex-wrap gap-2">
                      {selectedGroup.members.map((m) => (
                        <Chip
                          key={m.userId}
                          active={paidById === m.userId}
                          label={m.name}
                          onPress={() => {
                            setPaidById(m.userId);
                            setPaidByName(m.name);
                          }}
                        />
                      ))}
                    </View>
                  </Field>

                  <Field label="Split among (tap to toggle)">
                    <View className="flex-row flex-wrap gap-2">
                      {selectedGroup.members
                        .filter((m) => m.isActive)
                        .map((m) => (
                          <Chip
                            key={m.userId}
                            active={present.has(m.userId)}
                            label={m.name}
                            onPress={() => toggleMember(m.userId)}
                          />
                        ))}
                    </View>
                  </Field>
                </>
              )}
            </View>
          )}

          {type === "personal" && (
            <Field label="Your name (optional)">
              <Input
                value={paidByName}
                onChangeText={setPaidByName}
                placeholder={user?.name ?? "e.g. Mohit"}
                placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
              />
            </Field>
          )}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Amount">
                <Input
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="₹ 0.00"
                  placeholderTextColor="#71717a"
                  keyboardType="decimal-pad"
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="Date">
                <Pressable
                  onPress={() => setShowDate(true)}
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3"
                >
                  <Text className="text-zinc-100">{date}</Text>
                </Pressable>
              </Field>
            </View>
          </View>

          {showDate && (
            <DateTimePicker
              value={date ? new Date(date) : new Date()}
              mode="date"
              onChange={(_, d) => {
                setShowDate(false);
                if (d) setDate(d.toISOString().slice(0, 10));
              }}
            />
          )}

          <Field label="Currency">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <Chip
                  key={c}
                  active={currency === c}
                  label={c}
                  onPress={() => setCurrency(c)}
                />
              ))}
            </ScrollView>
          </Field>

          {(direction === "income" || type === "personal") && accounts.length > 0 && (
            <Field label="Account (optional)">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                <Chip active={accountId === ""} label="None" onPress={() => setAccountId("")} />
                {accounts.map((a) => (
                  <Chip
                    key={a._id}
                    active={accountId === a._id}
                    label={a.name}
                    onPress={() => setAccountId(a._id)}
                  />
                ))}
              </ScrollView>
            </Field>
          )}

          <Field label="Description">
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Groceries"
              placeholderTextColor="#71717a"
              className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
            />
          </Field>

          <Field label="Category">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {categoryList.map((c) => (
                <Chip
                  key={c}
                  active={category === c}
                  label={c}
                  onPress={() => setCategory(c)}
                />
              ))}
            </ScrollView>
          </Field>

          {error && (
            <Text className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </Text>
          )}

          <View className="mt-2">
            <GradientButton
              label={isEdit ? "Update Expense" : "Save Expense"}
              onPress={handleSave}
              loading={saving}
            />
          </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] uppercase tracking-wider text-zinc-500">
        {label}
      </Text>
      {children}
    </View>
  );
}

function Chip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg border px-3 py-1.5 ${
        active
          ? "border-brand-500/60 bg-brand-500/15"
          : "border-white/10 bg-zinc-900/40"
      }`}
    >
      <Text
        className={`text-xs font-medium ${
          active ? "text-brand-400" : "text-zinc-400"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
