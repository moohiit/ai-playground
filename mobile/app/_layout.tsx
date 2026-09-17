import "../global.css";
import { useEffect, useRef } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider, useAuth } from "../lib/auth";
import { AppDialog } from "../components/AppDialog";
import { useInAppUpdates } from "../lib/inAppUpdates";
import { setupNotificationHandler, registerPushToken } from "../lib/push";
import { routeForNotification } from "../lib/notificationRoute";

// Initialize notification handler before any screen renders
setupNotificationHandler();

function PushSetup() {
  const { user, loading, authFetch } = useAuth();
  const router = useRouter();
  // One navigation per tap: the cold-start read and the live listener can
  // both report the same response.
  const handled = useRef<string | null>(null);

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
    // Wait for the session: every target screen needs a user, and routing
    // before auth settles would bounce through /login and lose the target.
    if (loading || !user) return;

    const open = (response: import("expo-notifications").NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      const route = routeForNotification(response.notification.request.content.data);
      if (route) router.push(route);
    };

    // The tap that LAUNCHED the app is not delivered to the listener below —
    // it happened before any JS ran — so it is read once here, then cleared
    // so a later ordinary launch does not replay it.
    open(N.getLastNotificationResponse());
    N.clearLastNotificationResponse();

    const sub = N.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router, user, loading]);

  return null;
}

// Asks Play whether a newer build is live; see lib/inAppUpdates.ts.
function UpdateCheck() {
  useInAppUpdates();
  return null;
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <AuthProvider>
        <PushSetup />
        <AppDialog />
        <UpdateCheck />
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
