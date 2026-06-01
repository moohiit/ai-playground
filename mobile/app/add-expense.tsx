import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../lib/auth";
import { CATEGORIES } from "../lib/types";

type Member = {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
};
type Group = { _id: string; name: string; members: Member[] };

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function AddExpenseScreen() {
  const { user, authFetch } = useAuth();
  const router = useRouter();

  const [type, setType] = useState<"personal" | "group">("personal");
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [paidById, setPaidById] = useState(user?.userId ?? "");
  const [paidByName, setPaidByName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [date, setDate] = useState(todayISO());
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authFetch("/api/projects/expense-tracker/groups")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups ?? []))
      .catch(() => {});
  }, [authFetch]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g._id === groupId),
    [groups, groupId]
  );

  useEffect(() => {
    if (!selectedGroup) return;
    setPresent(
      new Set(selectedGroup.members.filter((m) => m.isActive).map((m) => m.userId))
    );
    if (selectedGroup.members.length > 0) {
      setPaidById(selectedGroup.members[0].userId);
      setPaidByName(selectedGroup.members[0].name);
    }
  }, [selectedGroup]);

  function toggleMember(id: string) {
    setPresent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    setError(null);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError("Enter a valid amount");
    if (!description.trim()) return setError("Enter a description");
    if (type === "group" && !groupId) return setError("Select a group");

    setSaving(true);
    try {
      const splitAmong =
        type === "group" && selectedGroup
          ? selectedGroup.members
              .filter((m) => present.has(m.userId))
              .map((m) => ({ memberId: m.userId, name: m.name }))
          : undefined;

      const payer =
        type === "group" && selectedGroup
          ? {
              id: paidById,
              name:
                selectedGroup.members.find((m) => m.userId === paidById)?.name ??
                paidByName,
            }
          : { id: user?.userId, name: user?.name || paidByName || "Me" };

      const res = await authFetch("/api/projects/expense-tracker/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          groupId: type === "group" ? groupId : undefined,
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
    <SafeAreaView className="flex-1 bg-[#05060a]" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text className="text-sm text-zinc-400">← Cancel</Text>
        </Pressable>
        <Text className="text-base font-semibold text-zinc-100">Add Expense</Text>
        <View style={{ width: 52 }} />
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Scan receipt */}
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
            <Text className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">
              Auto-fill with Gemini Vision
            </Text>
          </Pressable>

          {/* Type */}
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

          {/* Group selection */}
          {type === "group" && (
            <View className="gap-3">
              <Field label="Group">
                {groups.length === 0 ? (
                  <Text className="text-xs text-zinc-500">
                    No groups yet — create one on the web app first.
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
              <TextInput
                value={paidByName}
                onChangeText={setPaidByName}
                placeholder={user?.name ?? "e.g. Mohit"}
                placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
              />
            </Field>
          )}

          {/* Amount + Date */}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Amount">
                <TextInput
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
              <Field label="Date (YYYY-MM-DD)">
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-01-01"
                  placeholderTextColor="#71717a"
                  className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                />
              </Field>
            </View>
          </View>

          <Field label="Description">
            <TextInput
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
              {CATEGORIES.map((c) => (
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

          <Pressable
            onPress={handleSave}
            disabled={saving}
            className={`mt-2 items-center rounded-xl bg-brand-600 py-3.5 ${
              saving ? "opacity-60" : ""
            }`}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-sm font-semibold text-white">Save Expense</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
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
      <Text className="text-[11px] uppercase tracking-wider text-zinc-500">
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
