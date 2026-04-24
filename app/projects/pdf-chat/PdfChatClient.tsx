"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import type {
  AskResult,
  Citation,
  DocumentSummary,
} from "@/modules/pdf-chat/schemas";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  citations?: Citation[];
  grounded?: boolean;
  loading?: boolean;
  error?: string;
};

const HISTORY_WINDOW = 6;

export function PdfChatClient() {
  const { authFetch } = useAuth();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/projects/pdf-chat/documents");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setDocuments(data.documents);
      setSelectedId((prev) => {
        if (prev && data.documents.some((d: DocumentSummary) => d.id === prev)) {
          return prev;
        }
        const firstReady = data.documents.find(
          (d: DocumentSummary) => d.status === "ready"
        );
        return firstReady?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (uploading) return;
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        setError("Only PDF files are supported");
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await authFetch("/api/projects/pdf-chat/upload", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        await refresh();
        setSelectedId(data.document.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [authFetch, refresh, uploading]
  );

  async function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  }

  async function handleDelete(id: string) {
    try {
      const res = await authFetch(`/api/projects/pdf-chat/documents/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Delete failed");
      }
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  const [dragging, setDragging] = useState(false);
  const dragCounterRef = useRef(0);

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!e.dataTransfer?.types?.includes("Files")) return;
    dragCounterRef.current += 1;
    setDragging(true);
  }
  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setDragging(false);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }
  async function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) await uploadFile(file);
  }

  const selected = documents.find((d) => d.id === selectedId) ?? null;

  return (
    <div
      className="relative grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-brand-500/60 bg-zinc-950/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-base font-semibold text-brand-300">
              Drop your PDF here
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              Up to 6 MB, 40 pages. We&apos;ll chunk and embed it for you.
            </div>
          </div>
        </div>
      )}

      <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Documents
          </h2>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-400 transition hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {uploading ? <Spinner /> : "+"} Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {loading && documents.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Spinner /> Loading…
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500">
            No PDFs yet. Upload one to start asking questions.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {documents.map((d) => (
              <li key={d.id}>
                <div
                  role="button"
                  tabIndex={d.status === "ready" ? 0 : -1}
                  aria-disabled={d.status !== "ready"}
                  onClick={() =>
                    d.status === "ready" && setSelectedId(d.id)
                  }
                  onKeyDown={(e) => {
                    if (
                      d.status === "ready" &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      setSelectedId(d.id);
                    }
                  }}
                  className={cn(
                    "group flex w-full flex-col gap-1 rounded-lg border p-2.5 text-left transition",
                    selectedId === d.id
                      ? "border-brand-500/50 bg-brand-500/10"
                      : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700",
                    d.status !== "ready"
                      ? "cursor-default opacity-80"
                      : "cursor-pointer"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="line-clamp-2 text-xs font-medium text-zinc-200"
                      title={d.name}
                    >
                      {d.name}
                    </span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500">
                    <span>
                      {d.pageCount || "?"} pages · {d.chunkCount} chunks
                    </span>
                    <DeleteButton
                      onConfirm={() => handleDelete(d.id)}
                      label={`Delete ${d.name}`}
                    />
                  </div>
                  {d.errorMessage && (
                    <div className="text-[10px] text-red-400">
                      {d.errorMessage}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-sm">
        {!selected ? (
          <EmptyChat hasDocs={documents.length > 0} />
        ) : (
          <ChatPanel key={selected.id} document={selected} />
        )}
      </section>
    </div>
  );
}

function ChatPanel({ document }: { document: DocumentSummary }) {
  const { authFetch } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCitation, setActiveCitation] = useState<{
    messageId: string;
    chunkIndex: number;
  } | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 3 || asking) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const placeholderId = crypto.randomUUID();
    const placeholder: Message = {
      id: placeholderId,
      role: "assistant",
      content: "",
      loading: true,
    };

    const historyForApi = messages
      .filter((m) => !m.loading && !m.error)
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, placeholder]);
    setQuestion("");
    setAsking(true);

    try {
      const res = await authFetch("/api/projects/pdf-chat/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          question: trimmed,
          history: historyForApi,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ask failed");
      const result: AskResult = data.result;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                id: placeholderId,
                role: "assistant",
                content: result.answer,
                citations: result.citations,
                grounded: result.grounded,
              }
            : m
        )
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? {
                id: placeholderId,
                role: "assistant",
                content: "",
                error:
                  err instanceof Error ? err.message : "Something went wrong",
              }
            : m
        )
      );
    } finally {
      setAsking(false);
    }
  }

  function handleReset() {
    if (asking) return;
    setMessages([]);
    setActiveCitation(null);
  }

  return (
    <div className="flex h-[600px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="truncate text-zinc-300" title={document.name}>
            {document.name}
          </span>
          <span className="text-zinc-600">·</span>
          <span>
            {document.pageCount} pages · {document.chunkCount} chunks
          </span>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            disabled={asking}
            className="text-[11px] text-zinc-500 transition hover:text-zinc-300 disabled:opacity-40"
          >
            New chat
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"
      >
        {messages.length === 0 ? (
          <ChatEmptyState />
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              activeCitation={activeCitation}
              onCiteClick={(chunkIndex) =>
                setActiveCitation({ messageId: m.id, chunkIndex })
              }
            />
          ))
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          rows={2}
          placeholder="Ask about this PDF — Shift+Enter for a new line"
          className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={asking || question.trim().length < 3}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {asking ? (
            <>
              <Spinner /> Thinking
            </>
          ) : (
            <>Send →</>
          )}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({
  message,
  activeCitation,
  onCiteClick,
}: {
  message: Message;
  activeCitation: { messageId: string; chunkIndex: number } | null;
  onCiteClick: (chunkIndex: number) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600/30 px-4 py-2 text-sm text-zinc-100 ring-1 ring-brand-500/30">
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>
      </div>
    );
  }

  if (message.loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Thinking…
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="max-w-[90%] rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
        {message.error}
      </div>
    );
  }

  const active =
    activeCitation && activeCitation.messageId === message.id
      ? activeCitation.chunkIndex
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm leading-relaxed text-zinc-200">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider">
          {message.grounded ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Grounded
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Not found in doc
            </span>
          )}
        </div>
        <AnswerText
          text={message.content}
          onCiteClick={onCiteClick}
          activeChunk={active}
        />
      </div>

      {message.citations && message.citations.length > 0 && (
        <CitationList
          citations={message.citations}
          activeChunk={active}
          onPick={onCiteClick}
        />
      )}
    </div>
  );
}

function AnswerText({
  text,
  onCiteClick,
  activeChunk,
}: {
  text: string;
  onCiteClick: (n: number) => void;
  activeChunk: number | null;
}) {
  const parts = splitByCitations(text);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onCiteClick(p.chunkIndex)}
            className={cn(
              "mx-0.5 inline-flex items-center rounded-md px-1.5 py-0 text-[11px] font-mono align-middle transition",
              activeChunk === p.chunkIndex
                ? "bg-brand-500/30 text-brand-200 ring-1 ring-brand-500/60"
                : "bg-zinc-800 text-brand-300 hover:bg-zinc-700"
            )}
          >
            [#{p.chunkIndex}]
          </button>
        )
      )}
    </p>
  );
}

type Part =
  | { kind: "text"; value: string }
  | { kind: "cite"; chunkIndex: number };

function splitByCitations(text: string): Part[] {
  const parts: Part[] = [];
  const re = /\[#(\d+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ kind: "text", value: text.slice(lastIndex, match.index) });
    }
    parts.push({ kind: "cite", chunkIndex: parseInt(match[1], 10) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: "text", value: text.slice(lastIndex) });
  }
  return parts;
}

function CitationList({
  citations,
  activeChunk,
  onPick,
}: {
  citations: Citation[];
  activeChunk: number | null;
  onPick: (n: number) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-2">
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
        Sources
      </div>
      <ul className="flex flex-col gap-1.5">
        {citations.map((c) => {
          const isActive = activeChunk === c.chunkIndex;
          return (
            <li key={c.chunkIndex}>
              <button
                type="button"
                onClick={() => onPick(c.chunkIndex)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-md border p-2 text-left text-xs transition",
                  isActive
                    ? "border-brand-500/60 bg-brand-500/10 text-zinc-100"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
                )}
              >
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
                  <span>
                    [#{c.chunkIndex}] pages {c.pageStart}
                    {c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ""}
                  </span>
                  <span className="font-mono">score {c.score}</span>
                </div>
                <span
                  className={cn(
                    "line-clamp-2 leading-relaxed",
                    isActive ? "line-clamp-none" : undefined
                  )}
                >
                  {c.snippet}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChatEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm text-zinc-500">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-zinc-500">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="max-w-sm">
        Ask anything about this PDF. Answers are grounded in the document —
        [#n] tags link back to the exact excerpt.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DocumentSummary["status"] }) {
  if (status === "ready") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/30">
        Ready
      </span>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/30">
        <Spinner /> Processing
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-red-400 ring-1 ring-red-500/30">
      Failed
    </span>
  );
}

function EmptyChat({ hasDocs }: { hasDocs: boolean }) {
  if (hasDocs) {
    return (
      <div className="flex h-[480px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 text-center">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-zinc-500">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <p className="max-w-sm text-sm text-zinc-400">
          Select a document from the list to start asking questions.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex h-[480px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-brand-500/30 bg-gradient-to-b from-brand-500/5 to-transparent text-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />

      <div className="relative flex flex-col items-center gap-4 px-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/30 to-fuchsia-500/30 text-zinc-100 ring-1 ring-brand-500/30">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-100">
            Drop your first PDF to get started
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
            Drag anywhere on this pane, or click Upload on the left. We&apos;ll
            chunk it, embed it, and let you ask grounded questions with page
            citations.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-zinc-500">
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5">
            PDF · up to 6 MB
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5">
            up to 40 pages
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5">
            page-level citations
          </span>
        </div>
      </div>
    </div>
  );
}

function DeleteButton({
  onConfirm,
  label,
}: {
  onConfirm: () => void;
  label: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirming) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setConfirming(false);
      onConfirm();
      return;
    }
    setConfirming(true);
    timeoutRef.current = setTimeout(() => setConfirming(false), 3000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "text-[10px] transition",
        confirming
          ? "font-semibold text-red-400"
          : "text-zinc-500 hover:text-red-400"
      )}
      aria-label={label}
    >
      {confirming ? "Confirm?" : "Delete"}
    </button>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
      aria-hidden
    />
  );
}
