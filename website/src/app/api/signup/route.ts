import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { createUser } from "@/lib/db";
import { BOT_PHONE_NUMBER, BOT_API_URL } from "@/lib/constants";

const DEFAULT_WELCOME =
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
  `/agents \u2014 Switch between specialized agents\n` +
  `/sandbox \u2014 Check your workspace status\n` +
  `/usage \u2014 See your token usage\n` +
  `/stop \u2014 Cancel a running task\n` +
  `/reset \u2014 Start fresh (clears session)\n` +
  `/help \u2014 Full command list\n\n` +
  `So, what's your first challenge? Let's go! \u{1F680}`;

export async function POST(request: Request) {
  try {
    const { phone, agent, name, email } = await request.json();

    if (!phone || typeof phone !== "string") {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: "Full name is required" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: "A valid email address is required" },
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

    const agentId = agent || "general";

    const result = await createUser(normalized, {
      defaultAgent: agentId,
      fullName: name.trim(),
      email: email.trim().toLowerCase(),
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 409 }
      );
    }

    const chatId = normalized.replace("+", "");

    // Set up agent and send agent-specific welcome via bot API
    try {
      await fetch(`${BOT_API_URL}/setup-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, agentId }),
      });
    } catch {
      // Agent setup failed — fall back to default welcome
    }

    // Send default welcome message (covers general agent or if setup-agent didn't send one)
    if (agentId === "general") {
      try {
        await fetch(`${BOT_API_URL}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: DEFAULT_WELCOME }),
        });
      } catch {
        // Don't fail signup if welcome message fails
      }
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
