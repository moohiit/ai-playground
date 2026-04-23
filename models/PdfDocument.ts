import mongoose, { Schema, type Model, type Types } from "mongoose";

export type PdfDocumentStatus = "processing" | "ready" | "failed";

export type PdfDocumentDoc = {
  _id: Types.ObjectId;
  userId: string;
  name: string;
  sizeBytes: number;
  pageCount: number;
  chunkCount: number;
  status: PdfDocumentStatus;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

const pdfDocumentSchema = new Schema<PdfDocumentDoc>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    pageCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
      index: true,
    },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

pdfDocumentSchema.index({ userId: 1, createdAt: -1 });

export const PdfDocument: Model<PdfDocumentDoc> =
  (mongoose.models.PdfDocument as Model<PdfDocumentDoc>) ||
  mongoose.model<PdfDocumentDoc>("PdfDocument", pdfDocumentSchema);
