import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/demo-data";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Demo user auth
    if (email === DEMO_USER.email && password === DEMO_USER.password) {
      const token = crypto.randomBytes(32).toString("hex");
      // In production this would go to a DB/session store.
      // For demo we encode the user identity into a signed token.
      const payload = Buffer.from(JSON.stringify({
        email: DEMO_USER.email,
        name: DEMO_USER.name,
        phone: DEMO_USER.phone,
        demo: true,
        exp: Date.now() + 24 * 60 * 60 * 1000, // 24h
      })).toString("base64url");

      return NextResponse.json({
        token: `demo.${payload}.${token.slice(0, 16)}`,
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

    // TODO: real user auth against DB
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
