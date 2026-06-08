import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "../../lib/auth";

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 18, color }}>{icon}</Text>;
}

export default function TabsLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#05060a]">
        <ActivityIndicator color="#6366f1" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#818cf8",
        tabBarInactiveTintColor: "#71717a",
        tabBarStyle: {
          backgroundColor: "#0a0b14",
          borderTopColor: "rgba(255,255,255,0.08)",
        },
        sceneStyle: { backgroundColor: "#05060a" },
      }}
    >
      {/* Primary tabs (max 5 for a comfortable bottom bar) */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <TabIcon icon="📈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: "Expenses",
          tabBarIcon: ({ color }) => <TabIcon icon="🧾" color={color} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: "Budgets",
          tabBarIcon: ({ color }) => <TabIcon icon="🎯" color={color} />,
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: "Groups",
          tabBarIcon: ({ color }) => <TabIcon icon="👥" color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color }) => <TabIcon icon="⋯" color={color} />,
        }}
      />

      {/* Secondary screens — reachable from the More tab, hidden from the bar */}
      <Tabs.Screen name="accounts" options={{ href: null, title: "Accounts" }} />
      <Tabs.Screen name="goals" options={{ href: null, title: "Goals" }} />
      <Tabs.Screen name="recurring" options={{ href: null, title: "Recurring" }} />
      <Tabs.Screen name="coach" options={{ href: null, title: "Coach" }} />
      <Tabs.Screen name="reports" options={{ href: null, title: "Reports" }} />
      <Tabs.Screen name="settings" options={{ href: null, title: "Settings" }} />
    </Tabs>
  );
}
