// Shared report-filter controls. These lived in app/(tabs)/reports.tsx, but
// expo-router route files shouldn't carry extra exports, and importing them
// from components/ created an app → components → app cycle.
import { Pressable, Text, View } from "react-native";
import { localISODate } from "../lib/dates";

export type QuickRange =
  | "all"
  | "this-month"
  | "last-30"
  | "last-90"
  | "this-year"
  | "custom";

export function quickRangeToDates(r: QuickRange): { from: string; to: string } {
  if (r === "all" || r === "custom") return { from: "", to: "" };
  const now = new Date();
  const to = localISODate(now);
  const start = new Date(now);
  if (r === "this-month") start.setDate(1);
  else if (r === "last-30") start.setDate(start.getDate() - 30);
  else if (r === "last-90") start.setDate(start.getDate() - 90);
  else if (r === "this-year") start.setMonth(0, 1);
  return { from: localISODate(start), to };
}

export function DateField({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View className="flex-1 gap-1.5">
      <Text className="text-[13px] uppercase tracking-wider text-zinc-500">{label}</Text>
      <Pressable
        onPress={onPress}
        className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3"
      >
        <Text className={value ? "text-zinc-100" : "text-zinc-500"}>{value || "Any"}</Text>
      </Pressable>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg border px-3 py-1.5 ${
        active ? "border-brand-500/60 bg-brand-500/15" : "border-white/10 bg-zinc-900/40"
      }`}
    >
      <Text className={`text-xs font-medium capitalize ${active ? "text-brand-400" : "text-zinc-400"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
