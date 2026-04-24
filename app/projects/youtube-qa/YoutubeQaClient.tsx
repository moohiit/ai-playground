"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import type { VideoSummary } from "@/modules/youtube-qa/schemas";

export function YoutubeQaClient() {
  const { authFetch } = useAuth();
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/projects/youtube-qa/videos");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setVideos(data.videos);
      setSelectedId((prev) => {
        if (prev && data.videos.some((v: VideoSummary) => v.id === prev)) {
          return prev;
        }
        const firstReady = data.videos.find(
          (v: VideoSummary) => v.status === "ready"
        );
        return firstReady?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load videos");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || ingesting) return;
    setIngesting(true);
    setError(null);
    try {
      const res = await authFetch("/api/projects/youtube-qa/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ingest failed");
      setUrl("");
      await refresh();
      setSelectedId(data.video.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ingest failed");
    } finally {
      setIngesting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await authFetch(
        `/api/projects/youtube-qa/videos/${id}`,
        { method: "DELETE" }
      );
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

  const selected = videos.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Add a video
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            required
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={ingesting || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-brand-600 via-brand-500 to-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ingesting ? (
              <>
                <Spinner /> Fetching transcript…
              </>
            ) : (
              <>Ingest video →</>
            )}
          </button>
        </form>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.18em] text-zinc-500">
            Videos
          </h2>
        </div>

        {loading && videos.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Spinner /> Loading…
          </div>
        ) : videos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500">
            No videos yet. Paste a URL above to start.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {videos.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => v.status === "ready" && setSelectedId(v.id)}
                  disabled={v.status !== "ready"}
                  className={cn(
                    "group flex w-full gap-2.5 rounded-lg border p-2 text-left transition",
                    selectedId === v.id
                      ? "border-brand-500/50 bg-brand-500/10"
                      : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700",
                    v.status !== "ready" && "cursor-default opacity-80"
                  )}
                >
                  <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-zinc-950">
                    {v.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.thumbnailUrl}
                        alt={v.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/80 px-1 py-[1px] font-mono text-[9px] text-zinc-200">
                      {formatDuration(v.durationSec)}
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-start justify-between gap-1">
                      <span
                        className="line-clamp-2 text-xs font-medium text-zinc-200"
                        title={v.title}
                      >
                        {v.title}
                      </span>
                      <StatusBadge status={v.status} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="truncate">{v.author ?? "—"}</span>
                      <DeleteButton
                        onConfirm={() => handleDelete(v.id)}
                        label={`Delete ${v.title}`}
                      />
                    </div>
                    {v.errorMessage && (
                      <div className="text-[10px] text-red-400 line-clamp-2">
                        {v.errorMessage}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-sm">
        {!selected ? (
          <EmptyState hasVideos={videos.length > 0} />
        ) : (
          <div className="flex h-[520px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 text-center text-sm text-zinc-500">
            <div className="text-xs uppercase tracking-wider text-brand-500">
              Selected: {selected.title}
            </div>
            Chat + player wire up in Steps 3 and 4.
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: VideoSummary["status"] }) {
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
        <Spinner />
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-red-400 ring-1 ring-red-500/30">
      Failed
    </span>
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
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (confirming) {
          setConfirming(false);
          onConfirm();
        } else {
          setConfirming(true);
        }
      }}
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

function EmptyState({ hasVideos }: { hasVideos: boolean }) {
  if (hasVideos) {
    return (
      <div className="flex h-[520px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 text-center text-sm text-zinc-400">
        Select a video from the list to start asking questions.
      </div>
    );
  }
  return (
    <div className="relative flex h-[520px] flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-red-500/30 bg-gradient-to-b from-red-500/5 to-transparent text-center">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 blur-3xl" />
      <div className="relative flex flex-col items-center gap-4 px-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/30 to-brand-500/30 text-zinc-100 ring-1 ring-red-500/30">
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
            <polygon points="23 7 16 12 23 17 23 7" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold text-zinc-100">
            Paste a YouTube URL to get started
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-400">
            We&apos;ll fetch the transcript, chunk it by time, and let you ask
            grounded questions that jump the player to the exact moment.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-zinc-500">
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5">
            up to 60 min
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5">
            must have captions
          </span>
          <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2 py-0.5">
            timestamp citations
          </span>
        </div>
      </div>
    </div>
  );
}

function formatDuration(sec: number): string {
  if (!sec) return "--:--";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
      aria-hidden
    />
  );
}
