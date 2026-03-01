import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Read With Me — Your Personal AI Assistant on WhatsApp",
  description:
    "Let me help you with your chaos. Marketing, emails, scheduling, research — all from WhatsApp.",
  openGraph: {
    title: "Read With Me — Your Personal AI Assistant on WhatsApp",
    description:
      "Let me help you with your chaos. Marketing, emails, scheduling, research — all from WhatsApp.",
    url: "https://read-with-me.ai",
    siteName: "Read With Me",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="bg-surface text-white antialiased">{children}</body>
    </html>
  );
}
