import { randomBytes, randomInt } from "crypto";

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function generateOtp(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(randomInt(min, max));
}

export function expiryFromNow(ms: number): Date {
  return new Date(Date.now() + ms);
}

export const TOKEN_TTL = {
  emailVerification: 24 * 60 * 60 * 1000,
  pendingEmail: 24 * 60 * 60 * 1000,
  passwordResetOtp: 15 * 60 * 1000,
};
