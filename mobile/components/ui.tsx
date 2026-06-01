import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

export const BRAND_GRADIENT = ["#6366f1", "#7c3aed", "#db2777"] as const;

/**
 * Ambient, multi-color glow background (soft SVG radial blobs over near-black).
 * Drop as the first child of a screen; render content above it.
 */
export function AppBackground() {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: "#05060a" }]}
    >
      <Svg height="100%" width="100%">
        <Defs>
          <RadialGradient id="b1" cx="18%" cy="8%" r="60%">
            <Stop offset="0%" stopColor="#6366f1" stopOpacity="0.30" />
            <Stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="b2" cx="92%" cy="22%" r="55%">
            <Stop offset="0%" stopColor="#db2777" stopOpacity="0.20" />
            <Stop offset="100%" stopColor="#db2777" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="b3" cx="50%" cy="105%" r="65%">
            <Stop offset="0%" stopColor="#7c3aed" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#b1)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#b2)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#b3)" />
      </Svg>
    </View>
  );
}

/** Primary action button with the brand gradient + sheen. */
export function GradientButton({
  label,
  onPress,
  disabled,
  loading,
  size = "lg",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: "lg" | "sm";
}) {
  const py = size === "lg" ? 14 : 9;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={{ borderRadius: 14, overflow: "hidden", opacity: disabled ? 0.55 : 1 }}
    >
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingVertical: py, alignItems: "center", justifyContent: "center" }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text
            style={{
              color: "#fff",
              fontWeight: "700",
              fontSize: size === "lg" ? 14 : 12,
            }}
          >
            {label}
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

/** A hero card with a subtle gradient fill + top accent line. */
export function GradientHero({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ borderRadius: 20, overflow: "hidden" }}>
      <LinearGradient
        colors={["rgba(99,102,241,0.22)", "rgba(124,58,237,0.10)", "rgba(219,39,119,0.10)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", borderRadius: 20 }}
      >
        {children}
      </LinearGradient>
    </View>
  );
}
