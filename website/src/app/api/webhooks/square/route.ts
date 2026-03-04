import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/square";
import {
  getUserBySubscriptionId,
  getUserByCustomerId,
  updateUserSubscriptionStatus,
  isWebhookProcessed,
  markWebhookProcessed,
} from "@/lib/db";
import { BOT_API_URL } from "@/lib/constants";

const SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "";
const NOTIFICATION_URL =
  (process.env.NEXT_PUBLIC_BASE_URL || "https://swayat.com") +
  "/api/webhooks/square";

/** Map Square subscription status to our DB status */
function mapSquareStatus(squareStatus: string): string {
  switch (squareStatus) {
    case "ACTIVE":
      return "active";
    case "CANCELED":
      return "canceled";
    case "PAUSED":
    case "DEACTIVATED":
      return "canceled";
    case "PENDING":
      return "trialing";
    default:
      return "active";
  }
}

async function sendWhatsAppMessage(phone: string, message: string) {
  const chatId = phone.replace("+", "");
  try {
    await fetch(`${BOT_API_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, message }),
    });
  } catch {
    // Best-effort notification
  }
}

export async function POST(request: Request) {
  // Always return 200 to prevent Square retries
  try {
    const body = await request.text();
    const signature = request.headers.get("x-square-hmacsha256-signature") || "";

    if (!SIGNATURE_KEY) {
      console.error("SQUARE_WEBHOOK_SIGNATURE_KEY not configured");
      return NextResponse.json({ received: true });
    }

    const valid = await verifyWebhookSignature(
      body,
      signature,
      SIGNATURE_KEY,
      NOTIFICATION_URL
    );

    if (!valid) {
      console.error("Invalid webhook signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const event = JSON.parse(body);
    const eventId: string = event.event_id;
    const eventType: string = event.type;

    // Idempotency check
    if (await isWebhookProcessed(eventId)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    await markWebhookProcessed(eventId, eventType);

    const data = event.data?.object;

    if (eventType === "subscription.updated" && data?.subscription) {
      const sub = data.subscription;
      const subscriptionId: string = sub.id;
      const squareStatus: string = sub.status;
      const dbStatus = mapSquareStatus(squareStatus);

      const user = await getUserBySubscriptionId(subscriptionId);
      if (user) {
        const oldStatus = user.subscription_status;
        await updateUserSubscriptionStatus(subscriptionId, dbStatus);

        // Notify on cancellation
        if (dbStatus === "canceled" && oldStatus !== "canceled") {
          await sendWhatsAppMessage(
            user.phone,
            "Your Swayat subscription has been canceled. You'll continue to have access until the end of your current billing period.\n\nIf this was a mistake, you can re-subscribe at https://swayat.com"
          );
        }

        // Notify on trial -> active transition
        if (dbStatus === "active" && oldStatus === "trialing") {
          await sendWhatsAppMessage(
            user.phone,
            "Your free trial has ended and your Swayat subscription is now active. You'll be billed $9.99/month.\n\nManage your subscription: https://swayat.com/account"
          );
        }
      }
    } else if (eventType === "invoice.payment_made" && data?.invoice) {
      const invoice = data.invoice;
      const subscriptionId: string | undefined = invoice.subscription_id;
      if (subscriptionId) {
        await updateUserSubscriptionStatus(
          subscriptionId,
          "active",
          new Date()
        );
      }
    } else if (eventType === "invoice.payment_failed" && data?.invoice) {
      const invoice = data.invoice;
      const subscriptionId: string | undefined = invoice.subscription_id;
      if (subscriptionId) {
        await updateUserSubscriptionStatus(subscriptionId, "past_due");

        const user = await getUserBySubscriptionId(subscriptionId);
        if (user) {
          await sendWhatsAppMessage(
            user.phone,
            "Your Swayat payment failed. Please update your card to avoid service interruption.\n\nUpdate card: https://swayat.com/account"
          );
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ received: true });
  }
}
