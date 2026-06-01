import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { apiUrl } from "../lib/api";
import { AppBackground, GradientButton } from "../components/ui";

type Stage = "email" | "code";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { applyAuth } = useAuth();

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequest() {
    setError(null);
    setInfo(null);
    if (!email.trim()) return setError("Enter your email");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/password-reset/request"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setInfo(data.message ?? "If that email exists, we sent a 6-digit code.");
      setStage("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) return setError("Enter the 6-digit code");
    if (newPassword.length < 6)
      return setError("Password must be at least 6 characters");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/password-reset/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Reset failed");
      await applyAuth(data.token, {
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1">
      <AppBackground />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.duration(500)}>
            <View className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] p-6">
              <View className="mb-6 items-center">
                <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/20">
                  <Text className="text-xl">🔑</Text>
                </View>
                <Text className="text-2xl font-bold text-zinc-50">
                  Reset password
                </Text>
                <Text className="mt-1 text-center text-sm text-zinc-500">
                  {stage === "email"
                    ? "Enter your email to get a reset code"
                    : "Enter the code we emailed and your new password"}
                </Text>
              </View>

              <View className="gap-3">
                {stage === "email" ? (
                  <>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="Email"
                      placeholderTextColor="#71717a"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                    />
                    {error && <ErrorText text={error} />}
                    <GradientButton
                      label="Send reset code"
                      onPress={handleRequest}
                      loading={loading}
                    />
                  </>
                ) : (
                  <>
                    {info && (
                      <Text className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                        {info}
                      </Text>
                    )}
                    <TextInput
                      value={otp}
                      onChangeText={setOtp}
                      placeholder="6-digit code"
                      placeholderTextColor="#71717a"
                      keyboardType="number-pad"
                      maxLength={6}
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-center text-lg tracking-[8px] text-zinc-100"
                    />
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="New password"
                      placeholderTextColor="#71717a"
                      secureTextEntry
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                    />
                    {error && <ErrorText text={error} />}
                    <GradientButton
                      label="Reset & sign in"
                      onPress={handleVerify}
                      loading={loading}
                    />
                    <Pressable onPress={() => setStage("email")} className="items-center pt-1">
                      <Text className="text-xs text-zinc-500">
                        Didn’t get a code? Try again
                      </Text>
                    </Pressable>
                  </>
                )}

                <Pressable
                  onPress={() => router.replace("/login")}
                  className="items-center pt-2"
                >
                  <Text className="text-xs text-zinc-500">← Back to sign in</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ErrorText({ text }: { text: string }) {
  return (
    <Text className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
      {text}
    </Text>
  );
}
