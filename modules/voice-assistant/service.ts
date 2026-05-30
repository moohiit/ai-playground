import { complete } from "@/lib/llm";

const SYSTEM_PROMPT = `You are a helpful voice assistant. Keep responses concise and conversational — they will be read aloud via text-to-speech. Aim for 2-4 sentences unless the user asks for detail. Avoid markdown formatting, bullet points, or code blocks since the output is spoken audio.`;

type Message = { role: "user" | "assistant"; content: string };

export async function chat(
  messages: Message[],
  userMessage: string
): Promise<string> {
  const history = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const prompt = history
    ? `${history}\nUser: ${userMessage}\nAssistant:`
    : `User: ${userMessage}\nAssistant:`;

  const response = await complete(prompt, {
    system: SYSTEM_PROMPT,
    maxOutputTokens: 1024,
    temperature: 0.7,
  });

  return response.trim();
}
