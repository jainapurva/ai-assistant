export interface AgentDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export const AGENTS: AgentDef[] = [
  {
    id: "business",
    name: "Business Assistant",
    description: "Your AI-powered business assistant — handles emails, documents, research, and daily operations.",
    icon: "💼",
  },
  {
    id: "invoice",
    name: "Invoice & Payments",
    description: "Create professional invoices, track payments, send reminders, and manage your receivables.",
    icon: "🧾",
  },
  {
    id: "booking",
    name: "Booking Manager",
    description: "Schedule appointments, manage bookings, send reminders, and keep your calendar organized.",
    icon: "📅",
  },
  {
    id: "marketing",
    name: "Marketing Assistant",
    description: "Create campaigns, write ad copy, plan content calendars, and manage your social media presence.",
    icon: "📢",
  },
  {
    id: "support",
    name: "Customer Support",
    description: "Handle customer inquiries, create FAQ responses, manage support tickets, and improve service quality.",
    icon: "🎧",
  },
  {
    id: "real-estate",
    name: "Real Estate Agent",
    description: "Manage leads, track properties, schedule showings, automate follow-ups, and close more deals.",
    icon: "🏠",
  },
  {
    id: "website-manager",
    name: "Website Manager",
    description: "Build pages, fix bugs, optimize SEO, deploy updates, and manage your online presence.",
    icon: "🌐",
  },
];
