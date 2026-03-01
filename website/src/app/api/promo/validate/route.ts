import { NextResponse } from "next/server";
import { validatePromoCode } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== "string") {
      return NextResponse.json(
        { valid: false, error: "Promo code is required" },
        { status: 400 }
      );
    }

    const result = await validatePromoCode(code);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { valid: false, error: "Server error" },
      { status: 500 }
    );
  }
}
