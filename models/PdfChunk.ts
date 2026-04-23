import mongoose, { Schema, type Model, type Types } from "mongoose";

export type PdfChunkDoc = {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  userId: string;
  index: number;
  pageStart: number;
  pageEnd: number;
  text: string;
  embedding: number[];
  createdAt: Date;
};

const pdfChunkSchema = new Schema<PdfChunkDoc>(
  {
    documentId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: String, required: true, index: true },
    index: { type: Number, required: true },
    pageStart: { type: Number, required: true },
    pageEnd: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pdfChunkSchema.index({ documentId: 1, index: 1 });

export const PdfChunk: Model<PdfChunkDoc> =
  (mongoose.models.PdfChunk as Model<PdfChunkDoc>) ||
  mongoose.model<PdfChunkDoc>("PdfChunk", pdfChunkSchema);
