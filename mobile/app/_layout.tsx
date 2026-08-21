import "../global.css";
import { useEffect } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Stack, useRouter, type Href } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider, useAuth } from "../lib/auth";
import { setupNotificationHandler, registerPushToken } from "../lib/push";

// Initialize notification handler before any screen renders
setupNotificationHandler();

// The only `data.screen` values the backend attaches to a push (see
// modules/expense-tracker/push.ts). Anything else — group invites carry no
// screen — leaves the app wherever the user last was.
const PUSH_SCREEN_ROUTES: Record<string, Href> = {
  budgets: "/budgets",
  expenses: "/expenses",
  recurring: "/recurring",
  groups: "/groups",
};

function PushSetup() {
  const { user, authFetch } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      registerPushToken(authFetch);
    }
  }, [user, authFetch]);

  useEffect(() => {
    // Same Expo Go guard as lib/push.ts — expo-notifications crashes on import
    // there, so it stays behind a lazy require.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require("expo-notifications") as typeof import("expo-notifications");
    const sub = N.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      const route = typeof screen === "string" ? PUSH_SCREEN_ROUTES[screen] : undefined;
      if (route) router.push(route);
    });
    return () => sub.remove();
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <AuthProvider>
        <PushSetup />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#05060a" },
            animation: "fade",
          }}
        />
      </AuthProvider>
    </KeyboardProvider>
  );
}
