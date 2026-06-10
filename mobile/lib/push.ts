import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";

export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerPushToken(
  authFetch: (path: string, opts?: RequestInit) => Promise<Response>
) {
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("expense-tracker", {
        name: "Expense Tracker",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6366f1",
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = (
      Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    );
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    await authFetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenData.data }),
    });
  } catch {
    // best-effort — never crash the app over push setup
  }
}
