import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import type { Group } from "../../lib/types";
import { AppBackground, GradientButton } from "../../components/ui";

export default function GroupsTab() {
  const { authFetch } = useAuth();
  const router = useRouter();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await authFetch("/api/projects/expense-tracker/groups");
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      // keep last good state
    }
  }, [authFetch]);

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
          showForm ? (
            <View className="mb-3 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Group name (e.g. Room B4)"
                placeholderTextColor="#71717a"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
              />
              <TextInput
                value={emails}
                onChangeText={setEmails}
                placeholder="Member emails (comma separated)"
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                keyboardType="email-address"
                className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
              />
              <Text className="text-[11px] text-zinc-500">
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
          ) : null
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
            <Text className="mt-2 text-[11px] text-zinc-500">
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
