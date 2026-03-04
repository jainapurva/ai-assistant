import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { createUser } from "@/lib/db";
import { createCustomerWithCard, createSubscription } from "@/lib/square";
import { BOT_PHONE_NUMBER, BOT_API_URL } from "@/lib/constants";

const WELCOME_MESSAGE =
  `Hey! \u{1F44B}\n\n` +
  `I'm your personal AI assistant \u2014 think of me as a teammate who never sleeps and loves a good challenge.\n\n` +
  `*What can I do?*\n` +
  `\u{1F4DD} Answer questions & write content\n` +
  `\u{1F5BC}\uFE0F Analyze images \u2014 send one or multiple\n` +
  `\u{1F4C4} Read documents \u2014 PDFs, Word, Excel\n` +
  `\u{1F3B5} Transcribe audio & voice messages\n` +
  `\u{1F3AC} Analyze videos\n` +
  `\u{1F4E7} Send emails (once connected)\n` +
  `\u{1F4BB} Write & run code in your own sandbox\n\n` +
  `*Handy commands:*\n` +
  `/files \u2014 See & download files from your workspace\n` +
  `/gmail login \u2014 Connect your Gmail & Google Drive\n` +
  `/resend \u2014 Set up email sending via Resend\n` +
  `/sandbox \u2014 Check your workspace status\n` +
  `/usage \u2014 See your token usage\n` +
  `/stop \u2014 Cancel a running task\n` +
  `/reset \u2014 Start fresh (clears session)\n` +
  `/help \u2014 Full command list\n\n` +
  `So, what's your first challenge? Let's go! \u{1F680}`;

export async function POST(request: Request) {
  try {
    const { phone, promoCode, paymentToken } = await request.json();

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

    // If no promo code, a payment token is required
    if (!promoCode && !paymentToken) {
      return NextResponse.json(
        { success: false, error: "Payment information is required" },
        { status: 400 }
      );
    }

    let squareCustomerId: string | undefined;
    let squareSubscriptionId: string | undefined;
    let isPaid = false;

    // Process payment if token provided (no promo code path)
    if (paymentToken) {
      try {
        const { customerId, cardId } = await createCustomerWithCard(
          normalized,
          paymentToken
        );
        squareCustomerId = customerId;

        // Subscription starts billing 90 days from now
        const startDate = new Date();
        startDate.setDate(startDate.getDate() + 90);
        const startDateStr = startDate.toISOString().split("T")[0];

        squareSubscriptionId = await createSubscription(
          customerId,
          cardId,
          startDateStr
        );
        isPaid = true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Payment processing failed";
        return NextResponse.json(
          { success: false, error: message },
          { status: 402 }
        );
      }
    }

    const result = await createUser(normalized, {
      promoCode: promoCode || undefined,
      squareCustomerId,
      squareSubscriptionId,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 409 }
      );
    }

    // Send welcome message via bot's internal API
    const chatId = normalized.replace("+", "");
    try {
      await fetch(`${BOT_API_URL}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: WELCOME_MESSAGE }),
      });
    } catch {
      // Don't fail signup if welcome message fails
    }

    const waLink = `https://wa.me/${BOT_PHONE_NUMBER}?text=Hi`;

    return NextResponse.json({ success: true, waLink, isPaid });
  } catch {
    return NextResponse.json(
      { success: false, error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
