import { connectDB } from "@/lib/db";
import { complete, embedBatch, TaskType } from "@/lib/llm";
import { YoutubeChunk } from "@/models/YoutubeChunk";
import { YoutubeVideo } from "@/models/YoutubeVideo";
import mongoose from "mongoose";
import {
  ANSWER_SYSTEM_PROMPT,
  buildAnswerPrompt,
} from "./prompts";
import {
  MAX_CHUNK_CHARS,
  MAX_CHUNK_SECONDS,
  MAX_VIDEO_DURATION_SEC,
  MIN_RETRIEVAL_SCORE,
  RETRIEVAL_K,
  parseYoutubeVideoId,
  type AskInput,
  type AskResult,
  type Citation,
  type VideoSummary,
} from "./schemas";

export { parseYoutubeVideoId };

const EMBED_BATCH_SIZE = 20;
const VECTOR_INDEX = "yt_chunks_vector_index";
const NUM_CANDIDATES = 100;
const SNIPPET_CHARS = 180;

type TranscriptSegment = {
  text: string;
  startSec: number;
  endSec: number;
};

type VideoMeta = {
  title: string;
  author?: string;
  thumbnailUrl?: string;
};

async function fetchVideoMeta(videoId: string): Promise<VideoMeta> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`
  )}&format=json`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`oembed ${res.status}`);
    }
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      title: data.title ?? `YouTube video ${videoId}`,
      author: data.author_name,
      thumbnailUrl:
        data.thumbnail_url ??
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return {
      title: `YouTube video ${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  }
}

async function fetchTranscript(videoId: string): Promise<TranscriptSegment[]> {
  const { YoutubeTranscript } = await import("youtube-transcript");
  let raw: Array<{ text: string; duration: number; offset: number }>;
  try {
    raw = await YoutubeTranscript.fetchTranscript(videoId);
  } catch (err) {
    throw new Error(friendlyTranscriptError(err));
  }
  if (!raw || raw.length === 0) {
    throw new Error(
      "No transcript available for this video. Make sure captions are enabled by the creator."
    );
  }
  return raw.map((r) => {
    const startSec = r.offset > 1000 ? r.offset / 1000 : r.offset;
    const durationSec = r.duration > 1000 ? r.duration / 1000 : r.duration;
    return {
      text: decodeHtmlEntities(r.text).replace(/\s+/g, " ").trim(),
      startSec,
      endSec: startSec + durationSec,
    };
  });
}

function friendlyTranscriptError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.toLowerCase();
  if (m.includes("disabled") || m.includes("transcript is disabled")) {
    return "This video has transcripts disabled by the creator. Try a different video with captions turned on.";
  }
  if (m.includes("unavailable") || m.includes("not available")) {
    return "Video unavailable or has no transcripts. Check that the URL is correct and the video is public.";
  }
  if (m.includes("too many requests") || m.includes("429")) {
    return "YouTube is rate-limiting transcript fetches right now. Wait a minute and try again.";
  }
  if (m.includes("private") || m.includes("age")) {
    return "This video is private or age-restricted, so we can't fetch its transcript.";
  }
  if (m.includes("no transcript") || m.includes("no captions")) {
    return "No captions found on this video. Try one that has a [CC] badge on YouTube.";
  }
  return `Couldn't fetch transcript: ${msg}`;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

type Chunk = {
  text: string;
  startSec: number;
  endSec: number;
};

function chunkSegments(segments: TranscriptSegment[]): Chunk[] {
  if (segments.length === 0) return [];
  const chunks: Chunk[] = [];
  let buf = "";
  let chunkStart = segments[0].startSec;
  let chunkEnd = segments[0].endSec;

  for (const seg of segments) {
    if (!seg.text) continue;
    const joiner = buf ? " " : "";
    const candidate = buf + joiner + seg.text;
    const newDuration = seg.endSec - chunkStart;

    if (
      buf.length > 0 &&
      (candidate.length > MAX_CHUNK_CHARS || newDuration > MAX_CHUNK_SECONDS)
    ) {
      chunks.push({ text: buf, startSec: chunkStart, endSec: chunkEnd });
      buf = seg.text;
      chunkStart = seg.startSec;
      chunkEnd = seg.endSec;
    } else {
      buf = candidate;
      chunkEnd = seg.endSec;
    }
  }
  if (buf.length > 0) {
    chunks.push({ text: buf, startSec: chunkStart, endSec: chunkEnd });
  }
  return chunks;
}

export async function ingestVideo(opts: {
  userId: string;
  url: string;
}): Promise<VideoSummary> {
  const videoId = parseYoutubeVideoId(opts.url);
  if (!videoId) {
    throw new Error("Couldn't parse a YouTube video ID from that URL.");
  }

  await connectDB();

  const existing = await YoutubeVideo.findOne({
    userId: opts.userId,
    videoId,
  });
  if (existing && existing.status === "ready") {
    return toSummary(existing);
  }

  const meta = await fetchVideoMeta(videoId);

  const doc =
    existing ??
    (await YoutubeVideo.create({
      userId: opts.userId,
      videoId,
      title: meta.title,
      author: meta.author,
      thumbnailUrl: meta.thumbnailUrl,
      durationSec: 0,
      chunkCount: 0,
      status: "processing",
    }));

  if (existing) {
    doc.status = "processing";
    doc.errorMessage = undefined;
    doc.title = meta.title;
    doc.author = meta.author;
    doc.thumbnailUrl = meta.thumbnailUrl;
    await doc.save();
    await YoutubeChunk.deleteMany({ videoId: doc._id, userId: opts.userId });
  }

  try {
    const segments = await fetchTranscript(videoId);
    const durationSec = segments[segments.length - 1]?.endSec ?? 0;
    if (durationSec > MAX_VIDEO_DURATION_SEC) {
      throw new Error(
        `Video is ${Math.round(durationSec / 60)} min; max allowed is ${
          MAX_VIDEO_DURATION_SEC / 60
        } min.`
      );
    }

    const chunks = chunkSegments(segments);
    if (chunks.length === 0) throw new Error("Transcript produced no chunks.");

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await embedBatch(
        batch.map((c) => c.text),
        TaskType.RETRIEVAL_DOCUMENT
      );
      const rows = batch.map((c, j) => ({
        videoId: doc._id,
        userId: opts.userId,
        index: i + j,
        startSec: c.startSec,
        endSec: c.endSec,
        text: c.text,
        embedding: vectors[j],
      }));
      await YoutubeChunk.insertMany(rows, { ordered: false });
    }

    doc.durationSec = Math.round(durationSec);
    doc.chunkCount = chunks.length;
    doc.status = "ready";
    await doc.save();

    return toSummary(doc);
  } catch (err) {
    doc.status = "failed";
    doc.errorMessage = err instanceof Error ? err.message : String(err);
    await doc.save().catch(() => {});
    throw err;
  }
}

export async function listVideos(userId: string): Promise<VideoSummary[]> {
  await connectDB();
  const videos = await YoutubeVideo.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
  return videos.map((v) => ({
    id: v._id.toString(),
    videoId: v.videoId,
    title: v.title,
    author: v.author,
    thumbnailUrl: v.thumbnailUrl,
    durationSec: v.durationSec,
    chunkCount: v.chunkCount,
    status: v.status,
    errorMessage: v.errorMessage,
    createdAt: v.createdAt.toISOString(),
  }));
}

export async function answerQuestion(
  opts: AskInput & { userId: string }
): Promise<AskResult> {
  await connectDB();

  if (!mongoose.isValidObjectId(opts.videoId)) {
    throw new Error("Invalid video id");
  }

  const video = await YoutubeVideo.findOne({
    _id: opts.videoId,
    userId: opts.userId,
  }).lean();

  if (!video) throw new Error("Video not found");
  if (video.status !== "ready") {
    throw new Error(`Video is ${video.status}; cannot query yet.`);
  }

  const [queryVector] = await embedBatch(
    [opts.question],
    TaskType.RETRIEVAL_QUERY
  );

  type RetrievedChunk = {
    _id: unknown;
    index: number;
    startSec: number;
    endSec: number;
    text: string;
    score: number;
  };

  let retrieved: RetrievedChunk[];
  try {
    retrieved = await YoutubeChunk.aggregate<RetrievedChunk>([
      {
        $vectorSearch: {
          index: VECTOR_INDEX,
          path: "embedding",
          queryVector,
          numCandidates: NUM_CANDIDATES,
          limit: RETRIEVAL_K,
          filter: {
            userId: opts.userId,
            videoId: new mongoose.Types.ObjectId(opts.videoId),
          },
        },
      },
      {
        $project: {
          _id: 1,
          index: 1,
          startSec: 1,
          endSec: 1,
          text: 1,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/index.*not.*found|vectorSearch/i.test(msg)) {
      throw new Error(
        `Atlas vector index "${VECTOR_INDEX}" is missing. Create it on the "youtubechunks" collection (768 dims, cosine, with videoId + userId filters).`
      );
    }
    throw err;
  }

  const relevant = retrieved.filter((c) => c.score >= MIN_RETRIEVAL_SCORE);

  if (relevant.length === 0) {
    return {
      answer:
        "I can't find that in this video. Try rephrasing, or ask about something the video actually covers.",
      citations: [],
      grounded: false,
    };
  }

  const excerpts = relevant.map((c) => ({
    index: c.index,
    startSec: c.startSec,
    endSec: c.endSec,
    text: c.text,
  }));

  const answer = await complete(
    buildAnswerPrompt({
      question: opts.question,
      excerpts,
      history: opts.history ?? [],
    }),
    {
      system: ANSWER_SYSTEM_PROMPT,
      temperature: 0.2,
      maxOutputTokens: 1024,
    }
  );

  const citations: Citation[] = relevant.map((c) => ({
    chunkIndex: c.index,
    startSec: Math.round(c.startSec),
    endSec: Math.round(c.endSec),
    snippet:
      c.text.length > SNIPPET_CHARS
        ? c.text.slice(0, SNIPPET_CHARS).trimEnd() + "…"
        : c.text,
    score: Number(c.score.toFixed(3)),
  }));

  return {
    answer: answer.trim(),
    citations,
    grounded: true,
  };
}

export async function deleteVideo(opts: {
  userId: string;
  id: string;
}): Promise<void> {
  await connectDB();
  if (!mongoose.isValidObjectId(opts.id)) throw new Error("Invalid video id");
  const video = await YoutubeVideo.findOne({
    _id: opts.id,
    userId: opts.userId,
  });
  if (!video) throw new Error("Video not found");
  await YoutubeChunk.deleteMany({ videoId: video._id, userId: opts.userId });
  await video.deleteOne();
}

function toSummary(v: {
  _id: { toString(): string };
  videoId: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  durationSec: number;
  chunkCount: number;
  status: "processing" | "ready" | "failed";
  errorMessage?: string;
  createdAt: Date;
}): VideoSummary {
  return {
    id: v._id.toString(),
    videoId: v.videoId,
    title: v.title,
    author: v.author,
    thumbnailUrl: v.thumbnailUrl,
    durationSec: v.durationSec,
    chunkCount: v.chunkCount,
    status: v.status,
    errorMessage: v.errorMessage,
    createdAt: v.createdAt.toISOString(),
  };
}
