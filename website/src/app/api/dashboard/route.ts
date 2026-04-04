import { NextResponse } from "next/server";
import { DEMO_DASHBOARD } from "@/lib/demo-data";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = auth.slice(7);

  // Demo token — return demo data
  if (token.startsWith("demo.")) {
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      if (payload.exp < Date.now()) {
        return NextResponse.json({ error: "Session expired" }, { status: 401 });
      }
      return NextResponse.json(DEMO_DASHBOARD);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  // TODO: real user — fetch from bot API scoped to their phone
  return NextResponse.json({ error: "Unknown user" }, { status: 401 });
}
