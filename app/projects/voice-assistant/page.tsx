import { VoiceClient } from "./VoiceClient";

export const metadata = {
  title: "Voice Assistant · AI Playground",
  description:
    "Talk to a Gemini-powered assistant in your browser. Speech-to-text, AI reasoning, text-to-speech — all free.",
};

export default function VoiceAssistantPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <a href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← Back to projects
        </a>
        <h1 className="text-3xl font-bold tracking-tight">Voice Assistant</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Press the mic button and speak. Your voice is transcribed in the
          browser (Web Speech API), sent to Gemini for a response, and read
          back aloud (SpeechSynthesis). Fully free — no external STT/TTS APIs.
        </p>
      </header>
      <VoiceClient />
    </div>
  );
}
