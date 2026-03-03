import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { createUser } from "@/lib/db";
import { BOT_PHONE_NUMBER } from "@/lib/constants";

const BOT_API_URL = process.env.BOT_API_URL || "https://api.readwithme.ai";

const WELCOME_MESSAGE =
  `Hey! 👋\n\n` +
  `I'm your personal AI assistant — think of me as a teammate who never sleeps and loves a good challenge.\n\n` +
  `*What can I do?*\n` +
  `📝 Answer questions & write content\n` +
  `🖼️ Analyze images — send one or multiple\n` +
  `📄 Read documents — PDFs, Word, Excel\n` +
  `🎵 Transcribe audio & voice messages\n` +
  `🎬 Analyze videos\n` +
  `📧 Send emails (once connected)\n` +
  `💻 Write & run code in your own sandbox\n\n` +
  `*Handy commands:*\n` +
  `/files — See & download files from your workspace\n` +
  `/gmail login — Connect your Gmail & Google Drive\n` +
  `/resend — Set up email sending via Resend\n` +
  `/sandbox — Check your workspace status\n` +
  `/usage — See your token usage\n` +
  `/stop — Cancel a running task\n` +
  `/reset — Start fresh (clears session)\n` +
  `/help — Full command list\n\n` +
  `So, what's your first challenge? Let's go! 🚀`;

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

    // Send welcome message via bot's internal API
    // Phone format: "+14243937267" → chatId: "14243937267"
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

    return NextResponse.json({ success: true, waLink });
  } catch {
    return NextResponse.json(
      { success: false, error: "Server error. Please try again." },
      { status: 500 }
    );
  }
}
