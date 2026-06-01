import { useEffect, useState } from "react";
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
import { AuthApiError, useAuth } from "../lib/auth";
import { AppBackground, GradientButton } from "../components/ui";

type Mode = "login" | "register";
type VerificationPrompt = { email: string; message: string };

export default function LoginScreen() {
  const { user, login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState<VerificationPrompt | null>(null);

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
        setPrompt({
          email: err.email ?? email,
          message:
            "Your email isn't verified yet. Check your inbox for the verification link.",
        });
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
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
            {prompt ? (
              <View className="items-center">
                <View className="mb-4 h-12 w-12 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/15">
                  <Text className="text-xl">✉️</Text>
                </View>
                <Text className="text-lg font-semibold text-zinc-100">
                  Check your inbox
                </Text>
                <Text className="mt-2 text-center text-sm text-zinc-400">
                  {prompt.message}
                </Text>
                <Text className="mt-1 text-xs text-zinc-500">
                  Sent to {prompt.email}
                </Text>
                <Pressable
                  onPress={() => {
                    setPrompt(null);
                    setMode("login");
                  }}
                  className="mt-6"
                >
                  <Text className="text-xs text-zinc-500">← Back to sign in</Text>
                </Pressable>
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
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder="Full name"
                      placeholderTextColor="#71717a"
                      className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                    />
                  )}
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    placeholderTextColor="#71717a"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="rounded-xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-zinc-100"
                  />
                  <TextInput
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
                </View>
              </>
            )}
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
