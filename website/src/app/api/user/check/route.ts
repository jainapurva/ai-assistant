import { NextResponse } from "next/server";
import { getUser } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");

  if (!phone) {
    return NextResponse.json(
      { registered: false, error: "Phone parameter required" },
      { status: 400 }
    );
  }

  try {
    const user = await getUser(phone);
    if (!user) {
      return NextResponse.json({ registered: false });
    }

    return NextResponse.json({
      registered: true,
      status: user.status,
      trialExpiresAt: user.trial_expires_at,
    });
  } catch {
    return NextResponse.json(
      { registered: false, error: "Server error" },
      { status: 500 }
    );
  }
}
