import { NextResponse } from "next/server";
import { DEMO_USER } from "@/lib/demo-data";

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

    // TODO: real token verification
    return NextResponse.json({ valid: false }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
