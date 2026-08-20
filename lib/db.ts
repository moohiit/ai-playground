import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not set in environment variables");
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = global as typeof globalThis & {
  _mongooseCache?: MongooseCache;
};

const cache: MongooseCache =
  globalWithMongoose._mongooseCache ?? { conn: null, promise: null };

if (!globalWithMongoose._mongooseCache) {
  globalWithMongoose._mongooseCache = cache;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    // Drop the cached promise if the connection fails, so the next request
    // retries. Without this a single failed connect (cold start, brief
    // network blip) poisoned the cache for the lifetime of the instance:
    // every later request awaited the same rejected promise and, because
    // getAuthUser used to swallow that error, answered 401 forever.
    cache.promise = mongoose
      .connect(MONGODB_URI!, { bufferCommands: false })
      .catch((err) => {
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
