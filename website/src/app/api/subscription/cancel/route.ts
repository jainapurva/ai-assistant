import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { getUser } from "@/lib/db";
import { cancelSubscription } from "@/lib/square";

export async function POST(request: Request) {
  try {
    const { phone } = await request.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    const normalized = normalizePhone(phone);
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid phone number" },
        { status: 400 }
      );
    }

    const user = await getUser(normalized);
    if (!user) {
      return NextResponse.json(
        { error: "No account found for this phone number" },
        { status: 404 }
      );
    }

    if (!user.square_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    const subscription = await cancelSubscription(
      user.square_subscription_id
    );

    return NextResponse.json({
      success: true,
      canceledDate: subscription.canceledDate,
      chargedThroughDate: subscription.chargedThroughDate,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to cancel subscription";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
