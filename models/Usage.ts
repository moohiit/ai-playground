import mongoose, { Schema, type Model } from "mongoose";

export type UsageDoc = {
  projectSlug: string;
  action: string;
  clientKey: string;
  tokensUsed?: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
};

const usageSchema = new Schema<UsageDoc>(
  {
    projectSlug: { type: String, required: true, index: true },
    action: { type: String, required: true },
    clientKey: { type: String, required: true },
    tokensUsed: { type: Number },
    latencyMs: { type: Number, required: true },
    success: { type: Boolean, required: true },
    errorMessage: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Usage: Model<UsageDoc> =
  (mongoose.models.Usage as Model<UsageDoc>) ||
  mongoose.model<UsageDoc>("Usage", usageSchema);
