import mongoose, { Schema, type Model, type Types } from "mongoose";

export type UserDoc = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  emailVerified: boolean;
  profilePhotoUrl?: string;
  profilePhotoPublicId?: string;
  emailVerificationToken?: string;
  emailVerificationTokenExpiresAt?: Date;
  emailVerificationOtpHash?: string;
  emailVerificationOtpExpiresAt?: Date;
  emailVerificationOtpAttempts?: number;
  passwordResetOtpHash?: string;
  passwordResetOtpExpiresAt?: Date;
  passwordResetOtpAttempts?: number;
  pendingEmail?: string;
  pendingEmailToken?: string;
  pendingEmailTokenExpiresAt?: Date;
  monthlyLimitOverrides?: Map<string, number>;
  // Bumped on password change/reset; JWTs carry it as `tv` and stop
  // validating once it moves — instant revocation of older sessions.
  tokenVersion?: number;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    emailVerified: { type: Boolean, default: false, index: true },
    profilePhotoUrl: { type: String },
    profilePhotoPublicId: { type: String },
    emailVerificationToken: { type: String, index: true },
    emailVerificationTokenExpiresAt: { type: Date },
    emailVerificationOtpHash: { type: String },
    emailVerificationOtpExpiresAt: { type: Date },
    emailVerificationOtpAttempts: { type: Number, default: 0 },
    passwordResetOtpHash: { type: String },
    passwordResetOtpExpiresAt: { type: Date },
    passwordResetOtpAttempts: { type: Number, default: 0 },
    pendingEmail: { type: String, lowercase: true },
    pendingEmailToken: { type: String, index: true },
    pendingEmailTokenExpiresAt: { type: Date },
    monthlyLimitOverrides: {
      type: Map,
      of: Number,
      default: undefined,
    },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ||
  mongoose.model<UserDoc>("User", userSchema);
