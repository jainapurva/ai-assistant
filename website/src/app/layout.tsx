import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

const siteUrl = "https://swayat.com";
const title = "Swayat AI — AI Agents That Grow Your Small Business";
const description =
  "Swayat deploys AI agents that handle invoicing, lead management, appointments, marketing, and customer support — all from WhatsApp. More revenue, lower costs, higher profit. Start free.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  keywords: [
    "Swayat AI",
    "WhatsApp business tools",
    "WhatsApp invoice bot",
    "WhatsApp appointment booking",
    "WhatsApp AI for business",
    "WhatsApp business automation",
    "AI business assistant WhatsApp",
    "small business AI tools",
    "WhatsApp invoice generator",
    "WhatsApp booking system",
    "WhatsApp marketing automation",
    "WhatsApp customer support bot",
    "AI tools for small business",
    "WhatsApp business API",
    "SMB AI assistant",
    "micro business AI tools",
    "freelancer AI assistant WhatsApp",
    "WhatsApp CRM",
    "WhatsApp payment reminders",
    "business automation WhatsApp",
    "WhatsApp real estate CRM",
    "real estate lead management WhatsApp",
    "AI real estate agent",
    "property lead scoring AI",
    "real estate follow-up automation",
  ],
  alternates: {
    canonical: siteUrl,
    languages: {
      "en": siteUrl,
      "en-US": siteUrl,
    },
  },
  openGraph: {
    title: "Swayat AI — AI Agents That Grow Your Small Business",
    description:
      "Swayat deploys AI agents that handle invoicing, leads, appointments, marketing, and support — all from WhatsApp. More revenue, lower costs, higher profit.",
    url: siteUrl,
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Swayat AI — AI Business Tools on WhatsApp",
    description:
      "Send invoices, book appointments, run campaigns — all from WhatsApp. Start free.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x32x16" },
      { url: "/logo-icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  category: "Business",
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Swayat AI",
    url: siteUrl,
    logo: `${siteUrl}/logo-512.png`,
    description:
      "AI-powered business tools for WhatsApp — invoicing, booking, marketing, and customer support for small businesses.",
    email: "support@swayat.com",
    sameAs: [],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Swayat AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Android, iOS (via WhatsApp)",
    description:
      "AI-powered business tools on WhatsApp. Send invoices, book appointments, run marketing campaigns, manage customer support — all through natural conversation.",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        name: "Starter (Free)",
        description: "100 messages/month, 1 business tool",
      },
      {
        "@type": "Offer",
        price: "9.99",
        priceCurrency: "USD",
        name: "Business",
        description:
          "2,000 messages/month, all business tools, Google Workspace integration",
      },
      {
        "@type": "Offer",
        price: "29.99",
        priceCurrency: "USD",
        name: "Pro",
        description:
          "10,000 messages/month, all tools, advanced analytics, dedicated support",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is Swayat AI?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Swayat AI provides AI-powered business tools through WhatsApp. Send invoices, book appointments, run marketing campaigns, and manage customer support — all by messaging your AI assistant in natural language.",
        },
      },
      {
        "@type": "Question",
        name: "How is Swayat AI different from Wati or Interakt?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Traditional WhatsApp business tools make you build chatbot flows with drag-and-drop builders. Swayat uses real AI that understands natural language. Just tell it what you need — no flow builders, no templates, no configuration.",
        },
      },
      {
        "@type": "Question",
        name: "How do I get access to Swayat AI?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Sign up for free on our website and get instant access to your AI assistant on WhatsApp. No credit card required.",
        },
      },
      {
        "@type": "Question",
        name: "What business tools are included?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Seven specialized AI tools: Invoice & Payments, Booking Manager, Marketing Assistant, Customer Support, Real Estate Agent, Business Assistant, and Website Manager.",
        },
      },
      {
        "@type": "Question",
        name: "Is my data secure?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Yes. All messages are encrypted via WhatsApp's end-to-end encryption. Each user gets an isolated environment, and your data is never shared with third parties or used for AI training.",
        },
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Swayat AI",
    url: siteUrl,
  },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        {jsonLd.map((schema, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
      </head>
      <body className="bg-surface text-heading antialiased">{children}</body>
      <GoogleAnalytics gaId="G-6X8242E5S3" />
    </html>
  );
}
