import { NextResponse } from "next/server";
import { getUserAnalytics, upsertUserAnalytics, getAllUserAnalytics } from "@/lib/db";

/**
 * GET /api/user/analytics?phone=+14155551234
 * Returns analytics for a specific user, or all users if no phone specified.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");

  try {
    if (phone) {
      const analytics = await getUserAnalytics(phone);
      if (!analytics) {
        return NextResponse.json({ found: false });
      }
      return NextResponse.json({ found: true, analytics });
    }

    // No phone — return all users' analytics
    const all = await getAllUserAnalytics();
    return NextResponse.json({ users: all });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/user/analytics
 * Upsert analytics data for a user. Called by the bot after each task.
 * Body: { phone, ...analytics fields }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, ...data } = body;

    if (!phone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400 }
      );
    }

    await upsertUserAnalytics(phone, data);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
