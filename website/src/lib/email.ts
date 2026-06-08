import { Resend } from "resend";
import crypto from "crypto";
import { isEmailUnsubscribed } from "./db";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "Swayat <noreply@swayat.com>";
const FOUNDER_FROM = "Apurva from Swayat <apurva@swayat.com>";
const FOUNDER_REPLY_TO = "apurva@swayat.com";
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://swayat.com";

function unsubscribeToken(email: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || "swayat-unsub-dev-secret";
  return crypto
    .createHmac("sha256", secret)
    .update(email.toLowerCase())
    .digest("hex")
    .slice(0, 32);
}

export function buildUnsubscribeUrl(email: string): string {
  const token = unsubscribeToken(email);
  return `${SITE_URL}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Reset your Swayat password",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #1a1a2e; margin-bottom: 16px;">Reset your password</h2>
          <p style="color: #555; line-height: 1.6;">
            We received a request to reset your Swayat account password. Click the button below to set a new password.
          </p>
          <div style="margin: 32px 0; text-align: center;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #16a34a; color: #fff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          <p style="color: #888; font-size: 14px; line-height: 1.5;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
          <p style="color: #aaa; font-size: 12px;">Swayat AI &mdash; Your WhatsApp Business Assistant</p>
        </div>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Email send failed:", err);
    return { success: false, error: "Failed to send email" };
  }
}

export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  waLink: string
): Promise<{ success: boolean; error?: string; suppressed?: boolean }> {
  try {
    if (await isEmailUnsubscribed(to)) {
      return { success: true, suppressed: true };
    }

    const safeName = firstName.replace(/[<>&"']/g, "").trim() || "there";
    const unsubUrl = buildUnsubscribeUrl(to);

    const text = [
      `Hey ${safeName},`,
      ``,
      `Welcome to Swayat! I'm Apurva, the founder.`,
      ``,
      `Your AI business assistant is now connected to your WhatsApp — message it anytime for help with bookings, invoices, customer replies, and more.`,
      ``,
      `→ Open WhatsApp: ${waLink}`,
      ``,
      `If you run into anything weird, just reply to this email — it comes straight to me.`,
      ``,
      `— Apurva`,
      ``,
      `---`,
      `Swayat AI — Your WhatsApp Business Assistant`,
      `Unsubscribe: ${unsubUrl}`,
    ].join("\n");

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Welcome to Swayat</title></head>
<body style="margin:0; padding:0; background-color:#f6f7f9;">
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 24px; color: #1a1a2e; background-color: #ffffff;">
    <h2 style="margin: 0 0 16px 0; font-size: 22px;">Hey ${safeName},</h2>
    <p style="color: #444; line-height: 1.6; font-size: 15px;">
      Welcome to Swayat! I'm Apurva, the founder. Your AI business assistant is now connected to your WhatsApp — just message it anytime to get help with bookings, invoices, customer replies, and more.
    </p>
    <div style="margin: 32px 0; text-align: center;">
      <a href="${waLink}" style="display: inline-block; background-color: #16a34a; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Open WhatsApp Chat
      </a>
    </div>
    <p style="color: #555; line-height: 1.6; font-size: 15px;">
      If you run into anything weird, just reply to this email — it comes straight to me.
    </p>
    <p style="color: #555; line-height: 1.6; font-size: 15px; margin-top: 24px;">
      — Apurva
    </p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 32px 0;" />
    <p style="color: #888; font-size: 12px; line-height: 1.5; margin: 0;">
      Swayat AI &mdash; Your WhatsApp Business Assistant<br />
      You're receiving this because you signed up at swayat.com.<br />
      <a href="${unsubUrl}" style="color: #888;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;

    const { error } = await getResend().emails.send({
      from: FOUNDER_FROM,
      to,
      replyTo: FOUNDER_REPLY_TO,
      subject: "Welcome to Swayat",
      text,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>, <mailto:apurva@swayat.com?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (error) {
      console.error("Resend error (welcome):", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error("Welcome email send failed:", err);
    return { success: false, error: "Failed to send welcome email" };
  }
}
