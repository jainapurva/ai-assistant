import { NextResponse } from "next/server";
import { markWelcomeSent } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { success: false, error: "Phone parameter required" },
        { status: 400 }
      );
    }

    await markWelcomeSent(phone);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}
