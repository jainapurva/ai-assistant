import { Resend } from "resend";
import crypto from "crypto";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || "test-secret-for-deliverability-check";
const SITE_URL = "https://swayat.com";

const TO = process.argv[2] || "apurvajain.kota@gmail.com";
const FIRST_NAME = process.argv[3] || "there";
const WA_LINK = "https://wa.me/13413455997?text=Hi";

function unsubToken(email) {
  return crypto.createHmac("sha256", UNSUBSCRIBE_SECRET).update(email.toLowerCase()).digest("hex").slice(0, 32);
}
const unsubUrl = `${SITE_URL}/unsubscribe?email=${encodeURIComponent(TO)}&token=${unsubToken(TO)}`;

const text = [
  `Hey ${FIRST_NAME},`,
  ``,
  `Welcome to Swayat! I'm Apurva, the founder.`,
  ``,
  `Your AI business assistant is now connected to your WhatsApp — message it anytime for help with bookings, invoices, customer replies, and more.`,
  ``,
  `→ Open WhatsApp: ${WA_LINK}`,
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
    <h2 style="margin: 0 0 16px 0; font-size: 22px;">Hey ${FIRST_NAME},</h2>
    <p style="color: #444; line-height: 1.6; font-size: 15px;">
      Welcome to Swayat! I'm Apurva, the founder. Your AI business assistant is now connected to your WhatsApp — just message it anytime to get help with bookings, invoices, customer replies, and more.
    </p>
    <div style="margin: 32px 0; text-align: center;">
      <a href="${WA_LINK}" style="display: inline-block; background-color: #16a34a; color: #ffffff; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px;">
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

const resend = new Resend(RESEND_API_KEY);
const { data, error } = await resend.emails.send({
  from: "Apurva from Swayat <apurva@swayat.com>",
  to: TO,
  replyTo: "apurva@swayat.com",
  subject: "Welcome to Swayat",
  text,
  html,
  headers: {
    "List-Unsubscribe": `<${unsubUrl}>, <mailto:apurva@swayat.com?subject=unsubscribe>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
});

if (error) {
  console.error("FAILED:", error);
  process.exit(1);
}
console.log("SENT id:", data?.id);
console.log("To:", TO);
console.log("Subject: Welcome to Swayat");
console.log("Unsub URL:", unsubUrl);
