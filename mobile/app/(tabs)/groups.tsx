import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Group } from "../../lib/types";
import { AppBackground, GradientButton, Input } from "../../components/ui";

type Invite = {
  _id: string;
  groupName: string;
  invitedBy: { id: string; name: string };
};

export default function GroupsTab() {
  const { authFetch } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const [res, iRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/groups"),
        authFetch("/api/projects/expense-tracker/invites"),
      ]);
      const data = await res.json().catch(() => ({}));
      const iData = await iRes.json().catch(() => ({}));
      setGroups(data.groups ?? []);
      setInvites(iData.invites ?? []);
    } catch {
      // keep last good state
    }
  }, [authFetch]);

  async function respondInvite(id: string, accept: boolean) {
    if (respondingId) return;
    setRespondingId(id);
    try {
      const res = await authFetch(
        `/api/projects/expense-tracker/invites/${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Error", data.error ?? "Couldn't respond to the invite");
      }
      await fetchGroups();
    } catch {
      Alert.alert("Error", "Network error — try again.");
    } finally {
      setRespondingId(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchGroups().finally(() => setLoading(false));
    }, [fetchGroups])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchGroups();
    setRefreshing(false);
  }, [fetchGroups]);

  async function handleCreate() {
    if (creating) return;
    setError(null);
    const memberEmails = emails
      .split(/[,\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!name.trim()) return setError("Enter a group name");
    if (memberEmails.length === 0)
      return setError("Add at least 1 member email");

    setCreating(true);
    try {
      const res = await authFetch("/api/projects/expense-tracker/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: "", memberEmails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create group");
      setName("");
      setEmails("");
      setShowForm(false);
      fetchGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
        <Text className="text-xl font-bold text-zinc-50">Groups</Text>
        <Pressable
          onPress={() => setShowForm((s) => !s)}
          className="rounded-lg bg-brand-600 px-3 py-1.5"
        >
          <Text className="text-xs font-semibold text-white">
            {showForm ? "Close" : "+ New Group"}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g._id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#6366f1"
          />
        }
        ListHeaderComponent={
          <>
          {invites.length > 0 && (
            <View className="mb-3 gap-2">
              {invites.map((inv) => (
                <View
                  key={inv._id}
                  className="rounded-2xl border border-brand-500/40 bg-brand-500/[0.08] p-4"
                >
                  <Text className="text-sm text-zinc-200">
                    <Text className="font-semibold">{inv.invitedBy.name}</Text>
                    {" invited you to join "}
                    <Text className="font-semibold text-brand-300">
                      {inv.groupName}
                    </Text>
                  </Text>
                  <View className="mt-3 flex-row gap-2">
                    <Pressable
                      onPress={() => respondInvite(inv._id, true)}
                      disabled={respondingId !== null}
                      className={`flex-1 items-center rounded-lg bg-brand-600 py-2 ${
                        respondingId !== null ? "opacity-50" : ""
                      }`}
                    >
                      <Text className="text-xs font-semibold text-white">
                        {respondingId === inv._id ? "…" : "Accept"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => respondInvite(inv._id, false)}
                      disabled={respondingId !== null}
                      className={`flex-1 items-center rounded-lg border border-zinc-700 py-2 ${
                        respondingId !== null ? "opacity-50" : ""
                      }`}
                    >
                      <Text className="text-xs font-medium text-zinc-400">
                        Decline
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
          {showForm ? (
            <View className="mb-3 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <Input
                value={name}
                onChangeText={setName}
                placeholder="Group name (e.g. Room B4)"
                placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
              />
              <Input
                value={emails}
                onChangeText={setEmails}
                placeholder="Member emails (comma separated)"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                keyboardType="email-address"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
              />
              <Text className="text-[13px] text-zinc-500">
                Members must already have an account.
              </Text>
              {error && (
                <Text className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                  {error}
                </Text>
              )}
              <GradientButton
                label="Create group"
                onPress={handleCreate}
                loading={creating}
              />
            </View>
          ) : null}
          </>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 8) * 50)}>
          <Pressable
            onPress={() =>
              router.push({ pathname: "/group/[id]", params: { id: item._id } })
            }
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-semibold text-zinc-100">
                {item.name}
              </Text>
              <Text className="text-zinc-500">›</Text>
            </View>
            {item.description ? (
              <Text className="mt-0.5 text-xs text-zinc-500">
                {item.description}
              </Text>
            ) : null}
            <Text className="mt-2 text-[13px] text-zinc-500">
              {item.members.length}{" "}
              {item.members.length === 1 ? "member" : "members"}
            </Text>
          </Pressable>
          </Animated.View>
        )}
        ListEmptyComponent={
          loading ? (
            <View className="items-center py-16">
              <ActivityIndicator color="#6366f1" />
            </View>
          ) : (
            <View className="items-center rounded-2xl border border-white/10 bg-white/[0.03] py-12">
              <Text className="text-sm text-zinc-400">
                No groups yet. Create one to split bills.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}
