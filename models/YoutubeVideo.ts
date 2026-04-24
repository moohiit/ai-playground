import mongoose, { Schema, type Model, type Types } from "mongoose";

export type YoutubeVideoStatus = "processing" | "ready" | "failed";

export type YoutubeVideoDoc = {
  _id: Types.ObjectId;
  userId: string;
  videoId: string;
  title: string;
  author?: string;
  thumbnailUrl?: string;
  durationSec: number;
  chunkCount: number;
  status: YoutubeVideoStatus;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
};

const youtubeVideoSchema = new Schema<YoutubeVideoDoc>(
  {
    userId: { type: String, required: true, index: true },
    videoId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    author: { type: String },
    thumbnailUrl: { type: String },
    durationSec: { type: Number, default: 0 },
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

youtubeVideoSchema.index({ userId: 1, createdAt: -1 });
youtubeVideoSchema.index({ userId: 1, videoId: 1 }, { unique: true });

export const YoutubeVideo: Model<YoutubeVideoDoc> =
  (mongoose.models.YoutubeVideo as Model<YoutubeVideoDoc>) ||
  mongoose.model<YoutubeVideoDoc>("YoutubeVideo", youtubeVideoSchema);
