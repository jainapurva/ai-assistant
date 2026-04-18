import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import crypto from "crypto";

const TOKEN_SECRET = process.env.JWT_SECRET || "swayat-default-secret-change-me";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

function signResetToken(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(`reset.${data}`).digest("hex").slice(0, 32);
  return `${data}.${sig}`;
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();

    // Always return success to prevent email enumeration
    const successResponse = NextResponse.json({
      message: "If an account with that email exists, we've sent a password reset link.",
    });

    const user = await getUserByEmail(emailLower);
    if (!user || !user.password_hash) {
      return successResponse;
    }

    // Token embeds first 16 chars of password hash so it self-invalidates on password change
    const hashPrefix = user.password_hash.slice(0, 16);
    const payload = {
      email: user.email,
      hp: hashPrefix,
      exp: Date.now() + 60 * 60 * 1000, // 1 hour
    };

    const token = signResetToken(payload);
    const resetUrl = `${BASE_URL}/reset-password?token=${token}`;

    await sendPasswordResetEmail(emailLower, resetUrl);

    return successResponse;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
