import { connectDB } from "@/lib/db";
import { embedBatch, TaskType } from "@/lib/llm";
import { PdfChunk } from "@/models/PdfChunk";
import { PdfDocument } from "@/models/PdfDocument";
import mongoose from "mongoose";
import {
  CHUNK_CHARS,
  CHUNK_OVERLAP,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
  type DocumentSummary,
} from "./schemas";

const EMBED_BATCH_SIZE = 20;

export type IngestResult = DocumentSummary;

export async function ingestPdf(opts: {
  userId: string;
  name: string;
  file: File;
}): Promise<IngestResult> {
  const { userId, name, file } = opts;

  if (file.size > MAX_PDF_BYTES) {
    throw new Error(
      `File too large (max ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB)`
    );
  }

  await connectDB();
  const doc = await PdfDocument.create({
    userId,
    name,
    sizeBytes: file.size,
    status: "processing",
    chunkCount: 0,
    pageCount: 0,
  });

  try {
    const pages = await extractPagesText(file);
    if (pages.length > MAX_PDF_PAGES) {
      throw new Error(
        `PDF has ${pages.length} pages (max ${MAX_PDF_PAGES}). Try a smaller file.`
      );
    }
    if (pages.every((p) => !p.trim())) {
      throw new Error(
        "Couldn't extract any text from this PDF — it may be image-based."
      );
    }

    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      throw new Error("No chunks produced from this PDF");
    }

    for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
      const vectors = await embedBatch(
        batch.map((c) => c.text),
        TaskType.RETRIEVAL_DOCUMENT
      );
      const rows = batch.map((c, j) => ({
        documentId: doc._id,
        userId,
        index: i + j,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        text: c.text,
        embedding: vectors[j],
      }));
      await PdfChunk.insertMany(rows, { ordered: false });
    }

    doc.pageCount = pages.length;
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

export async function listDocuments(userId: string): Promise<DocumentSummary[]> {
  await connectDB();
  const docs = await PdfDocument.find({ userId })
    .sort({ createdAt: -1 })
    .lean();
  return docs.map((d) => ({
    id: d._id.toString(),
    name: d.name,
    sizeBytes: d.sizeBytes,
    pageCount: d.pageCount,
    chunkCount: d.chunkCount,
    status: d.status,
    errorMessage: d.errorMessage,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function deleteDocument(opts: {
  userId: string;
  documentId: string;
}): Promise<void> {
  await connectDB();
  if (!mongoose.isValidObjectId(opts.documentId)) {
    throw new Error("Invalid document id");
  }
  const doc = await PdfDocument.findOne({
    _id: opts.documentId,
    userId: opts.userId,
  });
  if (!doc) throw new Error("Document not found");
  await PdfChunk.deleteMany({ documentId: doc._id, userId: opts.userId });
  await doc.deleteOne();
}

async function extractPagesText(file: File): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const buffer = await file.arrayBuffer();
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

type Chunk = { text: string; pageStart: number; pageEnd: number };

function chunkPages(pages: string[]): Chunk[] {
  type Unit = { para: string; page: number };
  const units: Unit[] = [];
  pages.forEach((raw, i) => {
    const page = i + 1;
    (raw ?? "")
      .split(/\n\s*\n+/)
      .map((p) => p.replace(/[ \t]+\n/g, "\n").replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0)
      .forEach((para) => units.push({ para, page }));
  });
  if (units.length === 0) return [];

  const chunks: Chunk[] = [];
  let buf = "";
  let pageStart = units[0].page;
  let pageEnd = pageStart;

  const pushChunk = () => {
    const cleaned = buf.trim();
    if (cleaned.length > 0) chunks.push({ text: cleaned, pageStart, pageEnd });
  };

  for (const unit of units) {
    const joiner = buf ? "\n\n" : "";
    const candidate = buf + joiner + unit.para;

    if (candidate.length > CHUNK_CHARS && buf.length > 0) {
      pushChunk();
      const overlapText = buf.slice(-CHUNK_OVERLAP);
      buf = overlapText + "\n\n" + unit.para;
      pageStart = unit.page;
      pageEnd = unit.page;
    } else {
      buf = candidate;
      pageEnd = unit.page;
    }
  }
  if (buf.length > 0) pushChunk();
  return chunks;
}

function toSummary(d: {
  _id: { toString(): string };
  name: string;
  sizeBytes: number;
  pageCount: number;
  chunkCount: number;
  status: "processing" | "ready" | "failed";
  errorMessage?: string;
  createdAt: Date;
}): DocumentSummary {
  return {
    id: d._id.toString(),
    name: d.name,
    sizeBytes: d.sizeBytes,
    pageCount: d.pageCount,
    chunkCount: d.chunkCount,
    status: d.status,
    errorMessage: d.errorMessage,
    createdAt: d.createdAt.toISOString(),
  };
}
