import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { AppBackground } from "../../components/ui";

const ITEMS: { icon: string; label: string; sub: string; route: string }[] = [
  { icon: "💳", label: "Accounts", sub: "Wallets, balances & transfers", route: "/accounts" },
  { icon: "📊", label: "Reports", sub: "Charts, trends & PDF export", route: "/reports" },
  { icon: "⚙️", label: "Settings", sub: "Base currency, account & more", route: "/settings" },
];

export default function MoreScreen() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="px-5 pb-2 pt-2">
        <Text className="text-xl font-bold text-zinc-50">More</Text>
        {user?.name ? (
          <Text className="mt-0.5 text-xs text-zinc-500">Signed in as {user.name}</Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}>
        {ITEMS.map((it) => (
          <Pressable
            key={it.route}
            onPress={() => router.push(it.route as never)}
            className="flex-row items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <Text className="text-2xl">{it.icon}</Text>
            <View className="flex-1">
              <Text className="text-base font-semibold text-zinc-100">{it.label}</Text>
              <Text className="text-xs text-zinc-500">{it.sub}</Text>
            </View>
            <Text className="text-lg text-zinc-600">›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
