import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { apiUrl } from "./api";

/**
 * Google Play in-app updates.
 *
 * Play compares the installed version code with the one live on the user's
 * track and draws its own prompt; the app only decides how hard to ask.
 * FLEXIBLE is the half-screen sheet the user can dismiss, and the download
 * runs in the background; the native module completes the install as soon
 * as it lands, so the app restarts then. IMMEDIATE is full screen and blocks
 * until updated — used only when the backend says this build is older than
 * it still supports, or Play's own priority for the release says so.
 *
 * Nothing here can ever block the app: no Play services, a sideloaded
 * build, no network — every failure is swallowed and the app just runs.
 */

// A dismissed sheet should not come straight back on the next foreground.
const RECHECK_MS = 60 * 60 * 1000;
const VERSION_TIMEOUT_MS = 5000;

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

async function fetchMinSupportedVersion(): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), VERSION_TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl("/api/projects/expense-tracker/app-version"), {
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { minSupportedVersion?: unknown };
    return typeof data.minSupportedVersion === "string" ? data.minSupportedVersion : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function useInAppUpdates() {
  const lastCheck = useRef(0);
  // A forced update that the user backed out of is asked again on every
  // foreground; a dismissed optional one waits out the hour.
  const forced = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    // Expo Go has no native module — same guard as lib/push.ts.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Updates = require("expo-in-app-updates") as typeof import("expo-in-app-updates");

    const check = async () => {
      const now = Date.now();
      if (!forced.current && now - lastCheck.current < RECHECK_MS) return;
      lastCheck.current = now;
      try {
        const info = await Updates.checkForUpdate();
        if (!info.updateAvailable || info.updateInProgress) return;

        const installed = Constants.expoConfig?.version ?? "0.0.0";
        const min = await fetchMinSupportedVersion();
        const belowMinimum = min !== null && compareVersions(installed, min) < 0;
        forced.current = belowMinimum;

        const wantImmediate = belowMinimum || info.serverUpdateType === "IMMEDIATE";
        const immediate = wantImmediate && info.immediateAllowed !== false;
        if (!immediate && info.flexibleAllowed === false) return;

        await Updates.startUpdate(immediate);
      } catch {
        /* Play not reachable or not a Play install — carry on. */
      }
    };

    void check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => sub.remove();
  }, []);
}
