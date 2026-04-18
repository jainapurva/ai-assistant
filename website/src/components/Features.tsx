import type { ComponentType, SVGProps } from "react";
import {
  InvoicingIcon,
  BookingIcon,
  MarketingIcon,
  ShopifyIcon,
  SupportIcon,
  EmailIcon,
  RealEstateIcon,
  InsightsIcon,
} from "./Icons";

type IconType = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

type Feature = {
  Icon: IconType;
  title: string;
  description: string;
  userMessage: string;
  botReply: string;
};

const features: Feature[] = [
  {
    Icon: InvoicingIcon,
    title: "Invoicing & Payments",
    description:
      "Create and send professional invoices in seconds. Track payments, send reminders, and manage your cash flow.",
    userMessage: "Create invoice for Meera, logo design, \u20B915,000",
    botReply: "Invoice #INV-2026-051 sent to Meera. Due: April 12, 2026.",
  },
  {
    Icon: BookingIcon,
    title: "Appointment Booking",
    description:
      "Let customers book appointments through WhatsApp. Automatic confirmations, reminders, and rescheduling.",
    userMessage: "Book Anita for facial tomorrow 3pm",
    botReply: "Booked! Anita \u2014 Facial, Mar 30, 3:00 PM. Confirmation sent.",
  },
  {
    Icon: MarketingIcon,
    title: "Marketing Campaigns",
    description:
      "Draft social media posts, email campaigns, and promotional content tailored to your brand and audience.",
    userMessage: "Write 5 Instagram posts for my bakery\u2019s Diwali sale",
    botReply: "5 posts ready with captions and hashtags. Want me to schedule them?",
  },
  {
    Icon: ShopifyIcon,
    title: "Shopify Store Management",
    description:
      "Create products, update prices, manage inventory, and track orders \u2014 run your entire Shopify store from WhatsApp.",
    userMessage: "Create Organic Cotton Hoodie, $59.99, sizes S, M, L, XL",
    botReply:
      "Product created and live in your store! 4 variants added. Want to set inventory levels?",
  },
  {
    Icon: SupportIcon,
    title: "Customer Support",
    description:
      "Draft responses to customer queries, resolve complaints, and maintain a consistent support tone.",
    userMessage: "A customer says order #456 hasn\u2019t arrived",
    botReply: "Draft reply ready: apology + tracking update + 10% discount code.",
  },
  {
    Icon: EmailIcon,
    title: "Email Management",
    description:
      "Send follow-ups, draft proposals, and manage your inbox \u2014 all from WhatsApp using your connected Gmail.",
    userMessage: "Send a follow-up to all unpaid clients",
    botReply: "3 follow-up emails sent to clients with outstanding invoices.",
  },
  {
    Icon: RealEstateIcon,
    title: "Real Estate Agent",
    description:
      "Manage leads, track properties, schedule site visits, automate follow-ups, and close more deals \u2014 your AI-powered real estate CRM on WhatsApp.",
    userMessage: "New lead: Mike, 512-555-0142, wants 3-bed in Austin under $500K",
    botReply:
      "Lead L-0042 created \u2014 Mike (HOT, score: 80). 3 matching properties found. Schedule a showing?",
  },
  {
    Icon: InsightsIcon,
    title: "Business Insights",
    description:
      "Get revenue summaries, expense breakdowns, and performance metrics without opening a spreadsheet.",
    userMessage: "Show me this month\u2019s revenue summary",
    botReply: "March revenue: \u20B92,45,000. Up 18% from February. Top client: Meera.",
  },
];

function MiniChat({
  userMessage,
  botReply,
}: {
  userMessage: string;
  botReply: string;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl bg-[#ece5dd] p-3">
      <div className="flex justify-end">
        <div className="max-w-[90%] rounded-xl rounded-tr-sm bg-[#dcf8c6] px-3 py-1.5 text-xs text-gray-800 shadow-sm">
          {userMessage}
        </div>
      </div>
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-xl rounded-tl-sm bg-white px-3 py-1.5 text-xs text-gray-700 shadow-sm">
          {botReply}
        </div>
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-heading sm:text-4xl">
          Everything your business needs,{" "}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            one chat away
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-body">
          No dashboards. No learning curve. Just tell Swayat what you need.
        </p>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ Icon, title, description, userMessage, botReply }) => (
            <div
              key={title}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/5 text-heading">
                <Icon size={24} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-heading">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-body">
                {description}
              </p>
              <div className="mt-auto">
                <MiniChat userMessage={userMessage} botReply={botReply} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
