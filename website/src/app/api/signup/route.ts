import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { createUser } from "@/lib/db";
import { BOT_PHONE_NUMBER } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { phone, promoCode } = await request.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid phone number. Please include your country code (e.g. +1 for US).",
        },
        { status: 400 }
      );
    }

    const result = await createUser(normalized, promoCode);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 409 }
      );
    }

    const waLink = `https://wa.me/${BOT_PHONE_NUMBER}?text=Hi`;

    return NextResponse.json({ success: true, waLink });
  } catch {
    return NextResponse.json(
      { success: false, error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
