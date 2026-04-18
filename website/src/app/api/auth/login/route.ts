import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/demo-data";
import { getUserByEmail } from "@/lib/db";
import crypto from "crypto";

const TOKEN_SECRET = process.env.JWT_SECRET || "swayat-default-secret-change-me";

function verifyPassword(password: string, hash: string): boolean {
  const [saltHex, keyHex] = hash.split(":");
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const key = crypto.scryptSync(password, salt, 64);
  return key.toString("hex") === keyHex;
}

function signToken(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SECRET).update(data).digest("hex").slice(0, 32);
  return `user.${data}.${sig}`;
}

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();

    // Demo user auth (keep for testing)
    if (emailLower === DEMO_USER.email && password === DEMO_USER.password) {
      const payload = {
        email: DEMO_USER.email,
        name: DEMO_USER.name,
        phone: DEMO_USER.phone,
        demo: true,
        exp: Date.now() + 24 * 60 * 60 * 1000,
      };
      const token = crypto.randomBytes(32).toString("hex");
      return NextResponse.json({
        token: `demo.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${token.slice(0, 16)}`,
        user: {
          name: DEMO_USER.name,
          email: DEMO_USER.email,
          phone: DEMO_USER.phone,
          brokerage: DEMO_USER.brokerage,
          license: DEMO_USER.license,
          region: DEMO_USER.region,
        },
      });
    }

    // Real user auth against DB
    const user = await getUserByEmail(emailLower);
    if (!user || !user.password_hash) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const payload = {
      phone: user.phone,
      email: user.email,
      name: user.full_name,
      exp: Date.now() + 24 * 60 * 60 * 1000, // 24h
    };

    return NextResponse.json({
      token: signToken(payload),
      user: {
        name: user.full_name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
