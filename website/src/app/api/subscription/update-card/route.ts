import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { getUser } from "@/lib/db";
import { createCardOnFile, updateSubscriptionCard } from "@/lib/square";

export async function POST(request: Request) {
  try {
    const { phone, paymentToken } = await request.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { error: "Phone number is required" },
        { status: 400 }
      );
    }

    if (!paymentToken || typeof paymentToken !== "string") {
      return NextResponse.json(
        { error: "Payment token is required" },
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

    if (!user.square_customer_id || !user.square_subscription_id) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 400 }
      );
    }

    const newCardId = await createCardOnFile(
      user.square_customer_id,
      paymentToken
    );

    await updateSubscriptionCard(user.square_subscription_id, newCardId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update card";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
