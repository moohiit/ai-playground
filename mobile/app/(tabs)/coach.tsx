import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { AppBackground } from "../../components/ui";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Where is most of my money going?",
  "Where can I cut spending?",
  "Am I on track for my budget?",
  "Which subscriptions should I review?",
];

export default function CoachScreen() {
  const { authFetch } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await authFetch("/api/projects/expense-tracker/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Coach is unavailable");
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: e instanceof Error ? e.message : "Coach is unavailable" },
      ]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      <AppBackground />
      <View className="flex-row items-center gap-2 px-5 pb-2 pt-2">
        <Pressable onPress={() => router.back()} hitSlop={8}><Text className="text-2xl text-zinc-400">‹</Text></Pressable>
        <View>
          <Text className="text-xl font-bold text-zinc-50">✨ Coach</Text>
          <Text className="text-[11px] text-zinc-500">Answers from your own numbers</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, gap: 10 }}>
          {messages.length === 0 ? (
            <View className="items-center gap-4 py-10">
              <Text className="text-3xl">✨</Text>
              <Text className="px-6 text-center text-sm text-zinc-400">
                Ask about your spending, budgets, or where to save. I only use your own data.
              </Text>
              <View className="gap-2">
                {STARTERS.map((s) => (
                  <Pressable key={s} onPress={() => send(s)} className="rounded-full border border-white/10 bg-zinc-900/40 px-4 py-2">
                    <Text className="text-xs text-zinc-300">{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m, i) => (
              <View key={i} className={m.role === "user" ? "items-end" : "items-start"}>
                <View
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-brand-600" : "border border-white/10 bg-white/[0.05]"}`}
                >
                  <Text className={m.role === "user" ? "text-sm text-white" : "text-sm text-zinc-200"}>{m.content}</Text>
                </View>
              </View>
            ))
          )}
          {sending && (
            <View className="items-start">
              <View className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5">
                <Text className="text-sm text-zinc-500">Thinking…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <View className="flex-row items-center gap-2 border-t border-white/10 p-3">
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            placeholder="Ask your coach…"
            placeholderTextColor="#71717a"
            editable={!sending}
            className="flex-1 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 text-zinc-100"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={sending || !input.trim()}
            className={`rounded-xl bg-brand-600 px-4 py-2.5 ${sending || !input.trim() ? "opacity-50" : ""}`}
          >
            <Text className="text-sm font-semibold text-white">Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
