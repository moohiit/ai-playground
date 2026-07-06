import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { User, type UserDoc } from "@/models/User";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");

const TOKEN_EXPIRY = "7d";

export type JWTPayload = {
  userId: string;
  email: string;
  name: string;
  // Token version — must match User.tokenVersion for the token to be
  // accepted. Bumped on password change/reset to revoke older sessions.
  // Optional so pre-existing tokens (no claim) read as version 0.
  tv?: number;
};

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET!) as JWTPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getAuthUser(
  req: Request
): Promise<JWTPayload | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  let payload: JWTPayload;
  try {
    payload = verifyToken(authHeader.slice(7));
  } catch {
    return null;
  }
  // Signature alone isn't enough: the user must still exist (deleted
  // accounts' tokens kept working for 7 days) and the token's version must
  // match — a password change/reset bumps tokenVersion, instantly revoking
  // every previously issued session.
  try {
    await connectDB();
    const user = await User.findById(payload.userId)
      .select("tokenVersion")
      .lean();
    if (!user) return null;
    if ((payload.tv ?? 0) !== (user.tokenVersion ?? 0)) return null;
  } catch {
    return null;
  }
  return payload;
}

export async function requireAuth(req: Request): Promise<JWTPayload> {
  const user = await getAuthUser(req);
  if (!user) throw new AuthError("Not authenticated");
  return user;
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
  }
}
