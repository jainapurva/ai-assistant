import { NextResponse } from "next/server";
import { getUserByEmail, updateUserPassword } from "@/lib/db";
import crypto from "crypto";

const TOKEN_SECRET = process.env.JWT_SECRET || "swayat-default-secret-change-me";

function verifyResetToken(token: string): { valid: boolean; email?: string; error?: string } {
  try {
    const [data, sig] = token.split(".");
    if (!data || !sig) return { valid: false, error: "Invalid token format" };

    const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(`reset.${data}`).digest("hex").slice(0, 32);
    if (sig !== expectedSig) return { valid: false, error: "Invalid token" };

    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.exp < Date.now()) return { valid: false, error: "This reset link has expired" };

    return { valid: true, email: payload.email };
  } catch {
    return { valid: false, error: "Invalid token" };
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(32);
  const key = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function POST(req: Request) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const result = verifyResetToken(token);
    if (!result.valid || !result.email) {
      return NextResponse.json({ error: result.error || "Invalid token" }, { status: 400 });
    }

    // Fetch user and verify token's hash prefix still matches (password hasn't changed since token was issued)
    const user = await getUserByEmail(result.email);
    if (!user || !user.password_hash) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Re-parse token to check hash prefix
    const [data] = token.split(".");
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (user.password_hash.slice(0, 16) !== payload.hp) {
      return NextResponse.json({ error: "This reset link has already been used" }, { status: 400 });
    }

    const newHash = hashPassword(password);
    await updateUserPassword(user.email!, newHash);

    return NextResponse.json({ message: "Password updated successfully" });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
