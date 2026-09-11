import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { apiUrl } from "../../lib/api";
import { formatMoney } from "../../lib/currency";
import { AppBackground, GradientButton } from "../../components/ui";

/**
 * The public "who owes whom" view behind a group's share link, inside the
 * app. A share link tapped on a phone with Splitzy installed lands here
 * (see +native-intent.ts) instead of in the browser. It is the same read-only
 * payload the web page shows: no login needed, no group id exposed.
 */
type Shared = {
  groupName: string;
  currency: string;
  expenseCount: number;
  total: number;
  members: { name: string; paid: number; owed: number; net: number }[];
  settlements: { from: string; to: string; amount: number }[];
};

export default function SharedGroupScreen() {
  const { shareId } = useLocalSearchParams<{ shareId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/projects/expense-tracker/share/${shareId}`));
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "This share link is no longer active.");
        return;
      }
      setData(body as Shared);
    } catch {
      setError("Couldn't load this shared group. Check your connection.");
    }
  }, [shareId]);

  useEffect(() => {
    void load();
  }, [load]);

  const money = (n: number) => formatMoney(n, data?.currency ?? "INR");

  return (
    <SafeAreaView className="flex-1 bg-[#05060a]">
      <AppBackground />
      <View className="flex-row items-center px-5 pb-2 pt-3">
        <Pressable onPress={() => router.replace("/")} hitSlop={12}>
          <Text className="text-sm text-zinc-400">← Splitzy</Text>
        </Pressable>
        <Text className="ml-4 flex-1 text-base font-bold text-zinc-100" numberOfLines={1}>
          {data?.groupName ?? "Shared group"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {error ? (
          <View className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
            <Text className="text-sm text-red-300">{error}</Text>
          </View>
        ) : !data ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#a5b4fc" />
          </View>
        ) : (
          <>
            <View className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
              <Text className="text-xs uppercase tracking-wider text-zinc-500">Total spent</Text>
              <Text className="mt-1 text-2xl font-bold text-zinc-100">{money(data.total)}</Text>
              <Text className="mt-1 text-xs text-zinc-500">
                {data.expenseCount} {data.expenseCount === 1 ? "expense" : "expenses"} · read-only
                view shared by a member
              </Text>
            </View>

            {data.settlements.length > 0 && (
              <View className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <Text className="mb-3 text-sm font-semibold text-amber-300">Who pays whom</Text>
                <View className="gap-2">
                  {data.settlements.map((s, i) => (
                    <View
                      key={`${s.from}-${s.to}-${i}`}
                      className="flex-row items-center gap-2 rounded-lg border border-amber-500/20 bg-zinc-950/40 px-3 py-2"
                    >
                      <Text className="shrink text-sm text-red-400" numberOfLines={1}>
                        {s.from}
                      </Text>
                      <Text className="text-zinc-500">→</Text>
                      <Text className="shrink text-sm text-emerald-400" numberOfLines={1}>
                        {s.to}
                      </Text>
                      <Text className="ml-auto text-sm text-zinc-100">{money(s.amount)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
              <View className="flex-row border-b border-white/10 pb-1" style={{ gap: 8 }}>
                <Text style={{ flex: 1 }} className="text-[12px] uppercase text-zinc-500">
                  Member
                </Text>
                <Text style={{ width: 62 }} className="text-right text-[12px] uppercase text-zinc-500">
                  Paid
                </Text>
                <Text style={{ width: 62 }} className="text-right text-[12px] uppercase text-zinc-500">
                  Share
                </Text>
                <Text style={{ width: 70 }} className="text-right text-[12px] uppercase text-zinc-500">
                  Net
                </Text>
              </View>
              {data.members.map((m) => (
                <View key={m.name} className="flex-row border-b border-white/5 py-1.5" style={{ gap: 8 }}>
                  <Text style={{ flex: 1 }} className="text-xs text-zinc-200" numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text style={{ width: 62 }} className="text-right text-[13px] text-zinc-300">
                    {money(m.paid)}
                  </Text>
                  <Text style={{ width: 62 }} className="text-right text-[13px] text-zinc-300">
                    {money(m.owed)}
                  </Text>
                  <Text
                    style={{ width: 70 }}
                    className={`text-right text-[13px] ${
                      m.net > 0.01 ? "text-emerald-400" : m.net < -0.01 ? "text-red-400" : "text-zinc-500"
                    }`}
                  >
                    {m.net > 0 ? "+" : ""}
                    {money(m.net)}
                  </Text>
                </View>
              ))}
              {data.settlements.length === 0 && (
                <Text className="mt-3 text-xs text-zinc-500">All square — nothing outstanding.</Text>
              )}
            </View>

            <View className="mt-6">
              <GradientButton
                label={user ? "Open my groups" : "Sign in to Splitzy"}
                onPress={() => router.replace(user ? "/groups" : "/login")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
