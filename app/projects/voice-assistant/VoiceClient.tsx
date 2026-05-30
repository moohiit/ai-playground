"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };
type Status = "idle" | "listening" | "thinking" | "speaking";

export function VoiceClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function startListening() {
    setError(null);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setStatus("listening");
    recognition.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setTranscript(text);
    };
    recognition.onerror = (e: any) => {
      if (e.error !== "aborted") setError(`Speech error: ${e.error}`);
      setStatus("idle");
    };
    recognition.onend = () => {
      setStatus((s) => {
        if (s === "listening") {
          const text = transcript.trim();
          if (text) sendMessage(text);
          return "idle";
        }
        return s;
      });
    };

    setTranscript("");
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setTranscript("");
    setTextInput("");
    setStatus("thinking");
    setError(null);

    try {
      const res = await fetch("/api/projects/voice-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Chat failed");

      const assistantMsg: Message = { role: "assistant", content: data.reply };
      setMessages([...updatedMessages, assistantMsg]);

      if (autoSpeak) {
        speak(data.reply);
      } else {
        setStatus("idle");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
      setStatus("idle");
    }
  }

  function speak(text: string) {
    if (!window.speechSynthesis) {
      setStatus("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onstart = () => setStatus("speaking");
    utterance.onend = () => setStatus("idle");
    utterance.onerror = () => setStatus("idle");
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeaking() {
    window.speechSynthesis?.cancel();
    setStatus("idle");
  }

  function clearChat() {
    setMessages([]);
    setTranscript("");
    setError(null);
    window.speechSynthesis?.cancel();
    setStatus("idle");
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex h-[400px] flex-col gap-3 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
      >
        {messages.length === 0 && status === "idle" && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-zinc-500">
              Press the mic button or type a message to start.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[80%] rounded-xl px-4 py-3 text-sm",
              m.role === "user"
                ? "ml-auto bg-brand-600/20 text-zinc-200"
                : "mr-auto bg-zinc-800/60 text-zinc-300"
            )}
          >
            {m.content}
          </div>
        ))}
        {transcript && status === "listening" && (
          <div className="ml-auto max-w-[80%] rounded-xl bg-brand-600/10 px-4 py-3 text-sm italic text-zinc-400">
            {transcript}...
          </div>
        )}
        {status === "thinking" && (
          <div className="mr-auto flex items-center gap-2 rounded-xl bg-zinc-800/60 px-4 py-3 text-sm text-zinc-500">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500" style={{ animationDelay: "300ms" }} />
            </span>
            Thinking...
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3">
        {/* Text input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(textInput);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Or type a message..."
            disabled={status === "thinking" || status === "listening"}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!textInput.trim() || status === "thinking" || status === "listening"}
            className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Send
          </button>
        </form>

        {/* Voice + options */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {status === "listening" ? (
              <button
                onClick={stopListening}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : status === "speaking" ? (
              <button
                onClick={stopSpeaking}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg shadow-amber-500/30 transition hover:bg-amber-600"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                </svg>
              </button>
            ) : (
              <button
                onClick={startListening}
                disabled={status === "thinking"}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-500/30 transition hover:bg-brand-700 disabled:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </button>
            )}

            <div className="text-xs text-zinc-500">
              {status === "listening" && "Listening... click to stop"}
              {status === "thinking" && "Processing with Gemini..."}
              {status === "speaking" && "Speaking... click to stop"}
              {status === "idle" && "Click mic or type to chat"}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="rounded border-zinc-700"
              />
              Auto-speak replies
            </label>
            <button
              onClick={clearChat}
              className="text-xs text-zinc-600 hover:text-zinc-400"
            >
              Clear chat
            </button>
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
