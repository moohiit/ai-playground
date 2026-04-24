import mongoose, { Schema, type Model, type Types } from "mongoose";

export type YoutubeChunkDoc = {
  _id: Types.ObjectId;
  videoId: Types.ObjectId;
  userId: string;
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  embedding: number[];
  createdAt: Date;
};

const youtubeChunkSchema = new Schema<YoutubeChunkDoc>(
  {
    videoId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: String, required: true, index: true },
    index: { type: Number, required: true },
    startSec: { type: Number, required: true },
    endSec: { type: Number, required: true },
    text: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

youtubeChunkSchema.index({ videoId: 1, index: 1 });

export const YoutubeChunk: Model<YoutubeChunkDoc> =
  (mongoose.models.YoutubeChunk as Model<YoutubeChunkDoc>) ||
  mongoose.model<YoutubeChunkDoc>("YoutubeChunk", youtubeChunkSchema);
