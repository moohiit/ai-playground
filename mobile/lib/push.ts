import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

// expo-notifications was removed from Expo Go in SDK 53. Lazy-require it only
// in dev-client / production builds to avoid the side-effect crash in Expo Go.
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type ExpoNotifications = typeof import("expo-notifications");

function getN(): ExpoNotifications | null {
  if (IS_EXPO_GO) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications") as ExpoNotifications;
}

export function setupNotificationHandler() {
  const N = getN();
  if (!N) return;
  N.setNotificationHandler({
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
  const N = getN();
  if (!N) return;

  try {
    if (Platform.OS === "android") {
      // Channel ID stays "expense-tracker" (changing it orphans users'
      // notification preferences); only the visible name is rebranded.
      await N.setNotificationChannelAsync("expense-tracker", {
        name: "Splitzy AI",
        importance: N.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#6366f1",
      });
    }

    const { status: existing } = await N.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;
    const tokenData = await N.getExpoPushTokenAsync(
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
