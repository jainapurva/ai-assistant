import { NextResponse } from "next/server";
import { upsertBotHealth } from "@/lib/db";

/**
 * POST /api/admin/health
 * Bot heartbeat — pushed every 5 minutes by the bot's health-reporter.
 * Authenticated with SERVICE_API_SECRET (x-api-key header).
 */
export async function POST(request: Request) {
  const secret = process.env.SERVICE_API_SECRET;
  const key = request.headers.get("x-api-key");
  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await request.json();
    await upsertBotHealth(snapshot);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
