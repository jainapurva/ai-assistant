import { NextResponse } from "next/server";
import { getUser, getUserByEmail } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";
import { BOT_PHONE_NUMBER, BOT_API_URL } from "@/lib/constants";
import { normalizePhone } from "@/lib/phone";

export async function POST(request: Request) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { success: false, error: "ADMIN_TOKEN not configured on server" },
      { status: 500 }
    );
  }

  const headerToken =
    request.headers.get("x-admin-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    null;
  if (!headerToken || headerToken !== adminToken) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: { phone?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.phone && !body.email) {
    return NextResponse.json(
      { success: false, error: "Either phone or email required" },
      { status: 400 }
    );
  }

  const user = body.phone
    ? await getUser(normalizePhone(body.phone) || body.phone)
    : await getUserByEmail(body.email!);

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 404 }
    );
  }

  if (!user.email) {
    return NextResponse.json(
      { success: false, error: "User has no email on file — cannot send welcome email" },
      { status: 400 }
    );
  }

  const firstName = (user.full_name || "").trim().split(/\s+/)[0] || "there";
  const chatId = user.phone.replace("+", "");
  const agentId = user.default_agent || "business";
  const waLink = `https://wa.me/${BOT_PHONE_NUMBER}?text=Hi`;

  // Fire WhatsApp template via bot's /setup-agent + email in parallel
  const [waResult, emailResult] = await Promise.allSettled([
    (async () => {
      const res = await fetch(`${BOT_API_URL}/setup-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.SERVICE_API_SECRET || "",
        },
        body: JSON.stringify({ chatId, agentId }),
      });
      if (!res.ok) throw new Error(`setup-agent returned ${res.status}`);
      return true;
    })(),
    sendWelcomeEmail(user.email, firstName, waLink),
  ]);

  const waOk = waResult.status === "fulfilled";
  const emailOk =
    emailResult.status === "fulfilled" && emailResult.value.success;

  return NextResponse.json({
    success: waOk || emailOk,
    user: { phone: user.phone, email: user.email, firstName },
    whatsapp: {
      sent: waOk,
      error: !waOk ? String((waResult as PromiseRejectedResult).reason) : null,
    },
    email: {
      sent: emailOk,
      error: !emailOk
        ? emailResult.status === "rejected"
          ? String((emailResult as PromiseRejectedResult).reason)
          : (emailResult.value as { success: boolean; error?: string }).error
        : null,
    },
  });
}
