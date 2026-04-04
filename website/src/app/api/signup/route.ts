import { NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { createUser, markWelcomeSent } from "@/lib/db";
import { BOT_PHONE_NUMBER, BOT_API_URL } from "@/lib/constants";

// Map business types to recommended default agents
const BUSINESS_AGENT_MAP: Record<string, string> = {
  "Freelancer / Consultant": "invoice",
  "Salon / Spa / Beauty": "booking",
  "Restaurant / Cafe": "booking",
  "Retail / Local Shop": "invoice",
  "Online Store / E-commerce": "marketing",
  "Healthcare / Clinic": "booking",
  "Real Estate": "marketing",
  "Education / Tutoring": "booking",
  "Professional Services": "business",
  "Other": "business",
};

export async function POST(request: Request) {
  try {
    const { phone, businessType, name, email } = await request.json();

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

    // Auto-assign agent based on business type
    const agentId = BUSINESS_AGENT_MAP[businessType] || "business";

    const result = await createUser(normalized, {
      defaultAgent: agentId,
      fullName: name.trim(),
      email: email.trim().toLowerCase(),
      businessType: businessType || null,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 409 }
      );
    }

    const chatId = normalized.replace("+", "");

    // Set up agent and send agent-specific welcome via bot API
    let welcomeSent = false;
    try {
      const agentRes = await fetch(`${BOT_API_URL}/setup-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, agentId }),
      });
      if (agentRes.ok && agentId !== "business") {
        // Non-business agents send their own welcome via /setup-agent
        welcomeSent = true;
      }
    } catch (err) {
      console.error(`[signup] setup-agent failed for ${chatId}:`, err);
    }

    // Send welcome template for business agent (or if setup-agent didn't send one)
    if (!welcomeSent) {
      try {
        const firstName = name.trim().split(/\s+/)[0];
        const sendRes = await fetch(`${BOT_API_URL}/send-template`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            template: "swayat_ai_general",
            language: "en",
            params: { header: { name: firstName } },
          }),
        });
        if (sendRes.ok) {
          welcomeSent = true;
        } else {
          console.error(`[signup] welcome template returned ${sendRes.status} for ${chatId}`);
        }
      } catch (err) {
        console.error(`[signup] welcome template failed for ${chatId}:`, err);
      }
    }

    if (welcomeSent) {
      await markWelcomeSent(normalized);
    } else {
      console.error(`[signup] welcome NOT sent for ${chatId} — welcome_sent remains false`);
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
