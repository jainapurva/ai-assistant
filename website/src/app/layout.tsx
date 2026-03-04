import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Swayat — Your Personal AI Assistant on WhatsApp",
  description:
    "Let me help you with your chaos. Marketing, emails, scheduling, research — all from WhatsApp.",
  openGraph: {
    title: "Swayat — Your Personal AI Assistant on WhatsApp",
    description:
      "Let me help you with your chaos. Marketing, emails, scheduling, research — all from WhatsApp.",
    url: "https://swayat.com",
    siteName: "Swayat",
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
