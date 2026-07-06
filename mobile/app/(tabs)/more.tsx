import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Line,
  Path,
  Polyline,
  Rect,
} from "react-native-svg";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { AppBackground } from "../../components/ui";

// ── SVG icons ──────────────────────────────────────────────────────────────

function CoachIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GoalsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke="#fff" strokeWidth={1.8} />
      <Circle cx="12" cy="12" r="6" stroke="#fff" strokeWidth={1.8} />
      <Circle cx="12" cy="12" r="2" fill="#fff" />
    </Svg>
  );
}

function AccountsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="2" y="5" width="20" height="14" rx="2" stroke="#fff" strokeWidth={1.8} />
      <Path d="M2 10h20" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M6 15h4" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function RecurringIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M17 2.1 21 6l-4 3.9" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 11V9a4 4 0 0 1 4-4h14" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 21.9 3 18l4-3.9" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 13v2a4 4 0 0 1-4 4H3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ReportsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="14 2 14 8 20 8" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="8" y1="17" x2="8" y2="13" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="12" y1="17" x2="12" y2="11" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
      <Line x1="16" y1="17" x2="16" y2="15" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function WarrantyIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function NotesIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SettingsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke="#fff" strokeWidth={1.8} />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="#fff"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Menu items ─────────────────────────────────────────────────────────────

const ITEMS: {
  icon: React.ReactNode;
  bg: string;
  label: string;
  sub: string;
  route: string;
}[] = [
  {
    icon: <CoachIcon />,
    bg: "#7c3aed",
    label: "Coach",
    sub: "Ask about your spending & savings",
    route: "/coach",
  },
  {
    icon: <GoalsIcon />,
    bg: "#0891b2",
    label: "Goals",
    sub: "Savings targets & progress",
    route: "/goals",
  },
  {
    icon: <AccountsIcon />,
    bg: "#059669",
    label: "Accounts",
    sub: "Wallets, balances & transfers",
    route: "/accounts",
  },
  {
    icon: <RecurringIcon />,
    bg: "#d97706",
    label: "Recurring",
    sub: "Rent, subscriptions & bills",
    route: "/recurring",
  },
  {
    icon: <ReportsIcon />,
    bg: "#2563eb",
    label: "Reports",
    sub: "Charts, trends & PDF export",
    route: "/reports",
  },
  {
    icon: <WarrantyIcon />,
    bg: "#475569",
    label: "Warranties",
    sub: "Return windows & warranty expiry",
    route: "/warranty",
  },
  {
    icon: <NotesIcon />,
    bg: "#b45309",
    label: "Notes & To-dos",
    sub: "Lent money, promises & money chores",
    route: "/notes",
  },
  {
    icon: <SettingsIcon />,
    bg: "#374151",
    label: "Settings",
    sub: "Base currency, account & more",
    route: "/settings",
  },
];

// ── Screen ─────────────────────────────────────────────────────────────────

export default function MoreScreen() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="px-5 pb-2 pt-2">
        <Text className="text-xl font-bold text-zinc-50">More</Text>
        {user?.name ? (
          <Text className="mt-0.5 text-xs text-zinc-500">
            Signed in as {user.name}
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10 }}>
        {ITEMS.map((it) => (
          <Pressable
            key={it.route}
            onPress={() => router.push(it.route as never)}
            className="flex-row items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: it.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {it.icon}
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-zinc-100">
                {it.label}
              </Text>
              <Text className="text-xs text-zinc-500">{it.sub}</Text>
            </View>
            <Text className="text-lg text-zinc-600">›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
