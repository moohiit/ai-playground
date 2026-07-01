import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { AuthApiError, useAuth } from "../lib/auth";
import {
  AppBackground,
  GradientButton,
  Input,
  KeyboardAwareScreen,
} from "../components/ui";
import { apiUrl } from "../lib/api";

type Mode = "login" | "register";
type VerificationPrompt = { email: string; message: string };

export default function LoginScreen() {
  const { user, login, register, applyAuth } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState<VerificationPrompt | null>(null);
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user]);

  async function handleSubmit() {
    setError(null);
    setPrompt(null);
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
        router.replace("/dashboard");
      } else {
        const result = await register(name.trim(), email.trim(), password);
        if (result.kind === "verified") {
          router.replace("/dashboard");
        } else {
          setPrompt({ email: result.email, message: result.message });
          setLoading(false);
        }
      }
    } catch (err) {
      if (err instanceof AuthApiError && err.code === "EMAIL_NOT_VERIFIED") {
        setOtp("");
        setInfo(null);
        setPrompt({
          email: err.email ?? email,
          message:
            "Your email isn't verified yet. Enter the 6-digit code we emailed you, or resend a new one.",
        });
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!prompt) return;
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) return setError("Enter the 6-digit code");
    setVerifying(true);
    try {
      const res = await fetch(apiUrl("/api/auth/verify-email-otp"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: prompt.email, otp: otp.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      await applyAuth(data.token, {
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!prompt) return;
    setError(null);
    setInfo(null);
    try {
      await fetch(apiUrl("/api/auth/resend-verification"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: prompt.email }),
      });
      setInfo("A new code has been sent to your email.");
    } catch {
      setInfo("Couldn't resend right now — try again shortly.");
    }
  }

  return (
    <View className="flex-1">
      <AppBackground />

      <KeyboardAwareScreen
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
      >
          <Animated.View entering={FadeInDown.duration(500)}>
            <View className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] p-6">
            {prompt ? (
              <View>
                <View className="mb-5 items-center">
                  <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15">
                    <Text className="text-xl">✉️</Text>
                  </View>
                  <Text className="text-lg font-semibold text-zinc-100">
                    Verify your email
                  </Text>
                  <Text className="mt-2 text-center text-sm text-zinc-400">
                    {prompt.message}
                  </Text>
                  <Text className="mt-1 text-xs text-zinc-500">
                    Sent to {prompt.email}
                  </Text>
                </View>

                <View className="gap-3">
                  <Input
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="6-digit code"
                    placeholderTextColor="#71717a"
                    keyboardType="number-pad"
                    maxLength={6}
                    className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-center text-lg tracking-[8px] text-zinc-100"
                  />

                  {info && (
                    <Text className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                      {info}
                    </Text>
                  )}
                  {error && (
                    <Text className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                      {error}
                    </Text>
                  )}

                  <GradientButton
                    label="Verify & sign in"
                    onPress={handleVerifyOtp}
                    loading={verifying}
                  />

                  <Pressable onPress={handleResend} className="items-center pt-1">
                    <Text className="text-xs text-zinc-400">Resend code</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setPrompt(null);
                      setError(null);
                      setInfo(null);
                      setMode("login");
                    }}
                    className="items-center"
                  >
                    <Text className="text-xs text-zinc-500">← Back to sign in</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
                <View className="mb-6 items-center">
                  <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/20">
                    <Text className="text-xl">💸</Text>
                  </View>
                  <Text className="text-2xl font-bold text-zinc-50">
                    {mode === "login" ? "Welcome back" : "Create account"}
                  </Text>
                  <Text className="mt-1 text-sm text-zinc-500">
                    {mode === "login"
                      ? "Sign in to continue"
                      : "Join in seconds"}
                  </Text>
                </View>

                <View className="mb-5 flex-row gap-1 rounded-xl border border-white/10 bg-zinc-950/40 p-1">
                  {(["login", "register"] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setMode(m);
                        setError(null);
                      }}
                      className={`flex-1 rounded-lg py-2 ${
                        mode === m ? "bg-brand-600" : ""
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-medium capitalize ${
                          mode === m ? "text-white" : "text-zinc-400"
                        }`}
                      >
                        {m}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View className="gap-3">
                  {mode === "register" && (
                    <Input
                      value={name}
                      onChangeText={setName}
                      placeholder="Full name"
                      placeholderTextColor="#71717a"
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                    />
                  )}
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    placeholderTextColor="#71717a"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                  />
                  <Input
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#71717a"
                    secureTextEntry
                    className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                  />

                  {error && (
                    <Text className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                      {error}
                    </Text>
                  )}

                  <View className="mt-1">
                    <GradientButton
                      label={mode === "login" ? "Sign in" : "Create account"}
                      onPress={handleSubmit}
                      loading={loading}
                    />
                  </View>

                  {mode === "login" && (
                    <Pressable
                      onPress={() => router.push("/forgot-password")}
                      className="items-center pt-1"
                    >
                      <Text className="text-xs text-zinc-500">
                        Forgot password?
                      </Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
            </View>
          </Animated.View>
      </KeyboardAwareScreen>
    </View>
  );
}
