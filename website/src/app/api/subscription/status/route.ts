import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { getUser } from "@/lib/db";
import { getSubscription } from "@/lib/square";

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

    let squareSubscription = null;
    if (user.square_subscription_id) {
      try {
        squareSubscription = await getSubscription(
          user.square_subscription_id
        );
      } catch {
        // Square API may be unavailable; return DB data only
      }
    }

    return NextResponse.json({
      phone: user.phone,
      signupDate: user.signup_date,
      trialExpiresAt: user.trial_expires_at,
      subscriptionStatus: user.subscription_status,
      lastPaymentAt: user.last_payment_at,
      square: squareSubscription
        ? {
            status: squareSubscription.status,
            startDate: squareSubscription.startDate,
            chargedThroughDate: squareSubscription.chargedThroughDate,
            canceledDate: squareSubscription.canceledDate,
          }
        : null,
    });
  } catch {
    return NextResponse.json(
      { error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
