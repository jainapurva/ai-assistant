import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/demo-data";
import crypto from "crypto";

const TOKEN_SECRET = process.env.JWT_SECRET || "swayat-default-secret-change-me";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    // Demo token verification
    if (token.startsWith("demo.")) {
      try {
        const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
        if (payload.exp < Date.now()) {
          return NextResponse.json({ valid: false, reason: "expired" }, { status: 401 });
        }
        return NextResponse.json({
          valid: true,
          user: {
            name: DEMO_USER.name,
            email: DEMO_USER.email,
            phone: DEMO_USER.phone,
            brokerage: DEMO_USER.brokerage,
            license: DEMO_USER.license,
            region: DEMO_USER.region,
          },
        });
      } catch {
        return NextResponse.json({ valid: false }, { status: 401 });
      }
    }

    // Real user token verification
    if (token.startsWith("user.")) {
      try {
        const parts = token.split(".");
        if (parts.length !== 3) {
          return NextResponse.json({ valid: false }, { status: 401 });
        }
        const data = parts[1];
        const sig = parts[2];

        // Verify signature
        const expectedSig = crypto.createHmac("sha256", TOKEN_SECRET).update(data).digest("hex").slice(0, 32);
        if (sig !== expectedSig) {
          return NextResponse.json({ valid: false }, { status: 401 });
        }

        const payload = JSON.parse(Buffer.from(data, "base64url").toString());
        if (payload.exp < Date.now()) {
          return NextResponse.json({ valid: false, reason: "expired" }, { status: 401 });
        }

        return NextResponse.json({
          valid: true,
          user: {
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
          },
        });
      } catch {
        return NextResponse.json({ valid: false }, { status: 401 });
      }
    }

    return NextResponse.json({ valid: false }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
