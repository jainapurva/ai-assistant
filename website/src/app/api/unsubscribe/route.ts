import { NextResponse } from "next/server";
import { addUnsubscribedEmail } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";

async function handle(email: string | null, token: string | null) {
  if (!email || !token) {
    return NextResponse.json(
      { success: false, error: "Missing email or token" },
      { status: 400 }
    );
  }
  if (!verifyUnsubscribeToken(email, token)) {
    return NextResponse.json(
      { success: false, error: "Invalid token" },
      { status: 400 }
    );
  }
  try {
    await addUnsubscribedEmail(email);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[unsubscribe] failed:", err);
    return NextResponse.json(
      { success: false, error: "Server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");
  return handle(email, token);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");
  return handle(email, token);
}
