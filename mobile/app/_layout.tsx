import "../global.css";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { AuthProvider, useAuth } from "../lib/auth";
import { setupNotificationHandler, registerPushToken } from "../lib/push";

// Initialize notification handler before any screen renders
setupNotificationHandler();

function PushSetup() {
  const { user, authFetch } = useAuth();
  useEffect(() => {
    if (user) {
      registerPushToken(authFetch);
    }
  }, [user, authFetch]);
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
