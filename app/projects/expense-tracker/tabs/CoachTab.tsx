"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../../../../lib/utils";
import { useAuth } from "../../../../lib/authContext";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Where is most of my money going?",
  "Where can I cut spending this month?",
  "Am I on track for my budget?",
  "Which subscriptions should I review?",
];

export function CoachTab() {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setError(null);
    setSending(true);
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
      setError(e instanceof Error ? e.message : "Coach is unavailable");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40">
      <div className="flex items-center gap-2 border-b border-zinc-800/80 px-5 py-3">
        <span className="text-lg">✨</span>
        <div>
          <div className="text-sm font-semibold text-zinc-100">Spending Coach</div>
          <div className="text-[11px] text-zinc-500">Answers from your own numbers · not financial advice</div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="text-3xl">✨</div>
            <p className="max-w-sm text-sm text-zinc-400">
              Ask about your spending, budgets, subscriptions, or where to save. I only use your own data.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-700 bg-zinc-900/40 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-brand-500/50 hover:text-zinc-100"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user"
                    ? "bg-gradient-to-r from-brand-600 to-brand-500 text-white"
                    : "border border-zinc-800 bg-zinc-900/60 text-zinc-200"
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-sm text-zinc-500">
              Thinking…
            </div>
          </div>
        )}
        {error && <p className="text-center text-xs text-red-400">{error}</p>}
      </div>

      <div className="border-t border-zinc-800/80 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask your coach…"
            disabled={sending}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            className="shrink-0 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
