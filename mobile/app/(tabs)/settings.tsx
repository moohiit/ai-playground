import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../lib/auth";
import { WEB_BASE_URL } from "../../lib/api";
import { AppBackground, Input } from "../../components/ui";
import { SUPPORTED_CURRENCIES, currencySymbol } from "../../lib/currency";
const WEB_APP_URL = `${WEB_BASE_URL}/projects/expense-tracker`;

type Prefs = { baseCurrency: string; locale: string; weekStart: number };
type Profile = {
  name: string;
  email: string;
  emailVerified: boolean;
  profilePhotoUrl: string | null;
};

export default function SettingsScreen() {
  const { authFetch, user, logout, updateUserName, applyAuth } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBase, setSavingBase] = useState(false);
  const [savingWeek, setSavingWeek] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Profile name editing
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      authFetch("/api/projects/expense-tracker/prefs")
        .then((r) => r.json())
        .then((d) => setPrefs(d.prefs ?? null))
        .catch(() => {}),
      authFetch("/api/profile")
        .then((r) => r.json())
        .then((d) => {
          if (d.user) {
            setProfile(d.user);
            setName(d.user.name ?? "");
          }
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [authFetch]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function patch(body: Record<string, unknown>): Promise<Prefs> {
    const res = await authFetch("/api/projects/expense-tracker/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to save");
    return data.prefs as Prefs;
  }

  async function changeBase(next: string) {
    if (!prefs || next === prefs.baseCurrency) return;
    setSavingBase(true);
    setNote(null);
    const prev = prefs.baseCurrency;
    try {
      const updated = await patch({ baseCurrency: next });
      setPrefs(updated);
      setNote(`Base set to ${next}. Existing entries re-converted from ${prev}.`);
    } catch {
      Alert.alert("Couldn't change base currency", "Please try again.");
    } finally {
      setSavingBase(false);
    }
  }

  async function changeWeek(next: 0 | 1) {
    if (!prefs || next === prefs.weekStart) return;
    setSavingWeek(true);
    try {
      setPrefs(await patch({ weekStart: next }));
    } catch {
      /* keep previous */
    } finally {
      setSavingWeek(false);
    }
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === profile?.name) return;
    setSavingName(true);
    try {
      const res = await authFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update name");
      const newName = data.user?.name ?? trimmed;
      setProfile((p) => (p ? { ...p, name: newName } : p));
      updateUserName(newName);
      Alert.alert("Saved", "Your name was updated.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to set a picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setPhotoBusy(true);
    try {
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "photo.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);
      const res = await authFetch("/api/profile/photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setProfile((p) => (p ? { ...p, profilePhotoUrl: data.profilePhotoUrl } : p));
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Upload failed");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    try {
      const res = await authFetch("/api/profile/photo", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove photo");
      setProfile((p) => (p ? { ...p, profilePhotoUrl: null } : p));
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed to remove photo");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function changePassword() {
    setPwMsg(null);
    if (!currentPw || !newPw) {
      setPwMsg({ ok: false, text: "Fill in both password fields." });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ ok: false, text: "New password must be at least 6 characters." });
      return;
    }
    setSavingPw(true);
    try {
      const res = await authFetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      // The server revokes all old sessions (tokenVersion bump) and returns a
      // fresh token — apply it so THIS device stays signed in.
      if (data.token && user) await applyAuth(data.token, user);
      setCurrentPw("");
      setNewPw("");
      setPwMsg({ ok: true, text: "Password changed. Other devices were signed out." });
    } catch (e) {
      setPwMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Failed to change password",
      });
    } finally {
      setSavingPw(false);
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and all your data (personal expenses and groups you created). This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await authFetch("/api/auth/account", { method: "DELETE" });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error ?? "Failed to delete account");
              await logout();
              router.replace("/login");
            } catch (err) {
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Failed to delete account"
              );
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center gap-2 px-5 pb-2 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text className="text-2xl text-zinc-400">‹</Text>
        </Pressable>
        <Text className="text-xl font-bold text-zinc-50">Settings</Text>
      </View>

      {loading || !prefs ? (
        <View className="items-center py-16">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {/* Profile */}
          <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <View className="flex-row items-center gap-3">
              {profile?.profilePhotoUrl ? (
                <Image
                  source={{ uri: profile.profilePhotoUrl }}
                  className="h-14 w-14 rounded-full"
                />
              ) : (
                <View className="h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-brand-500/15">
                  <Text className="text-xl font-bold text-brand-300">
                    {(profile?.name ?? user?.name ?? "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View className="flex-1">
                <Text className="text-base font-semibold text-zinc-100">
                  {profile?.name ?? user?.name}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-2">
                  <Text className="text-xs text-zinc-500">{profile?.email ?? user?.email}</Text>
                  {profile && (
                    <Text
                      className={`text-[10px] font-medium ${
                        profile.emailVerified ? "text-emerald-400" : "text-amber-400"
                      }`}
                    >
                      {profile.emailVerified ? "✓ verified" : "unverified"}
                    </Text>
                  )}
                </View>
                <View className="mt-2 flex-row items-center gap-3">
                  <Pressable onPress={pickPhoto} disabled={photoBusy} hitSlop={6}>
                    <Text
                      className={`text-xs font-medium text-brand-400 ${
                        photoBusy ? "opacity-50" : ""
                      }`}
                    >
                      {photoBusy ? "Working…" : profile?.profilePhotoUrl ? "Change photo" : "Add photo"}
                    </Text>
                  </Pressable>
                  {profile?.profilePhotoUrl && !photoBusy && (
                    <Pressable onPress={removePhoto} hitSlop={6}>
                      <Text className="text-xs font-medium text-zinc-500">Remove</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            <Text className="mb-1.5 mt-4 text-[12px] uppercase tracking-wider text-zinc-500">
              Display name
            </Text>
            <View className="flex-row gap-2">
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor="#52525b"
                className="flex-1 rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              />
              <Pressable
                onPress={saveName}
                disabled={savingName || !name.trim() || name.trim() === profile?.name}
                className={`rounded-lg bg-brand-600 px-4 py-2 ${
                  savingName || !name.trim() || name.trim() === profile?.name
                    ? "opacity-40"
                    : ""
                }`}
              >
                <Text className="text-sm font-semibold text-white">
                  {savingName ? "…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>

          <Card
            title="Base currency"
            description="Every total and report is shown in this currency. Changing it re-converts all your existing entries at current rates."
          >
            <View className="flex-row flex-wrap gap-2">
              {SUPPORTED_CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  disabled={savingBase}
                  onPress={() => changeBase(c)}
                  className={`rounded-lg border px-3 py-1.5 ${
                    prefs.baseCurrency === c
                      ? "border-brand-500/60 bg-brand-500/15"
                      : "border-white/10 bg-zinc-900/40"
                  } ${savingBase ? "opacity-50" : ""}`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      prefs.baseCurrency === c ? "text-brand-400" : "text-zinc-400"
                    }`}
                  >
                    {currencySymbol(c)} {c}
                  </Text>
                </Pressable>
              ))}
            </View>
            {savingBase && (
              <Text className="mt-2 text-xs text-zinc-500">
                Re-converting your entries…
              </Text>
            )}
            {note && (
              <Text className="mt-2 rounded-md border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs text-brand-200">
                {note}
              </Text>
            )}
          </Card>

          <Card title="Week starts on" description="Used by weekly views and reports.">
            <View className="flex-row gap-2">
              {([
                [1, "Monday"],
                [0, "Sunday"],
              ] as const).map(([val, label]) => (
                <Pressable
                  key={val}
                  disabled={savingWeek}
                  onPress={() => changeWeek(val)}
                  className={`rounded-lg border px-4 py-2 ${
                    prefs.weekStart === val
                      ? "border-brand-500/60 bg-brand-500/15"
                      : "border-white/10 bg-zinc-900/40"
                  } ${savingWeek ? "opacity-50" : ""}`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      prefs.weekStart === val ? "text-brand-400" : "text-zinc-400"
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card
            title="Change password"
            description="Enter your current password and a new one (min 6 characters)."
          >
            <View className="gap-2">
              <Input
                value={currentPw}
                onChangeText={setCurrentPw}
                placeholder="Current password"
                placeholderTextColor="#52525b"
                secureTextEntry
                className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              />
              <Input
                value={newPw}
                onChangeText={setNewPw}
                placeholder="New password"
                placeholderTextColor="#52525b"
                secureTextEntry
                className="rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100"
              />
              {pwMsg && (
                <Text
                  className={`text-xs ${pwMsg.ok ? "text-emerald-400" : "text-red-400"}`}
                >
                  {pwMsg.text}
                </Text>
              )}
              <Pressable
                onPress={changePassword}
                disabled={savingPw}
                className={`self-start rounded-lg bg-brand-600 px-4 py-2 ${
                  savingPw ? "opacity-50" : ""
                }`}
              >
                <Text className="text-sm font-semibold text-white">
                  {savingPw ? "Saving…" : "Update password"}
                </Text>
              </Pressable>
            </View>
          </Card>

          <Card
            title="Open on the web"
            description="Use the full Expense Tracker in your browser — same account, same data."
          >
            <Pressable
              onPress={() => Linking.openURL(WEB_APP_URL)}
              className="self-start rounded-lg border border-brand-500/40 bg-brand-500/10 px-4 py-2"
            >
              <Text className="text-sm font-semibold text-white">
                Open web app ↗
              </Text>
            </Pressable>
          </Card>

          <Card title="Account" description={user?.email ?? ""}>
            <View className="flex-row flex-wrap gap-3">
              <Pressable
                onPress={logout}
                className="rounded-lg border border-white/10 bg-zinc-900/40 px-4 py-2"
              >
                <Text className="text-sm font-medium text-zinc-300">Log out</Text>
              </Pressable>
              <Pressable
                onPress={confirmDeleteAccount}
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2"
              >
                <Text className="text-sm font-medium text-red-300">
                  Delete account
                </Text>
              </Pressable>
            </View>
            <Text className="mt-3 text-[11px] text-zinc-600">
              Deleting your account permanently removes your personal expenses and
              the groups you created. This cannot be undone.
            </Text>
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <View className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Text className="text-sm font-semibold text-zinc-100">{title}</Text>
      {description ? (
        <Text className="mb-3 mt-0.5 text-xs text-zinc-500">{description}</Text>
      ) : (
        <View className="mb-3" />
      )}
      {children}
    </View>
  );
}
