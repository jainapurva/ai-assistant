"use client";

import { useState } from "react";

const faqs = [
  {
    q: "What is Swayat AI?",
    a: "Swayat AI provides AI-powered business tools through WhatsApp. Send invoices, book appointments, run marketing campaigns, and manage customer support \u2014 all by messaging your AI assistant in natural language. No apps to install, no complex dashboards to learn.",
  },
  {
    q: "How is this different from Wati or Interakt?",
    a: "Traditional WhatsApp business tools make you build chatbot flows with drag-and-drop builders. Swayat uses real AI that understands natural language. Just tell it \u2018invoice Raj for 5 hours at \u20B92000/hr\u2019 and it creates a professional invoice. No flow builders, no templates, no configuration.",
  },
  {
    q: "How do I get access?",
    a: "We're rolling out beta access in small batches to ensure every business gets a great onboarding experience. Join the waitlist and we'll reach out when it's your turn. Beta users get full access to all tools at no cost during the beta period.",
  },
  {
    q: "What business tools are included?",
    a: "Seven specialized AI tools: Invoice & Payments (create invoices, track payments), Booking Manager (schedule appointments), Marketing Assistant (social media, email campaigns), Customer Support (manage inquiries), Real Estate Agent (manage leads, properties, showings, and follow-ups), Business Assistant (emails, documents, research), and Website Manager (build and maintain your site).",
  },
  {
    q: "How does the Real Estate Agent work?",
    a: "The Real Estate Agent is a full CRM inside WhatsApp. Add leads by texting their details, and the AI auto-scores them as hot, warm, or cold using BANT criteria (Budget, Authority, Need, Timeline). Add your property listings, and the AI matches leads to properties automatically. Schedule site visits, track follow-ups, and get pipeline stats \u2014 all through conversation. No CRM dashboard needed.",
  },
  {
    q: "Can I connect my Google account?",
    a: "Yes. Connect Gmail, Google Calendar, Google Drive, and Google Sheets directly from WhatsApp. Your AI assistant can read emails, schedule appointments, manage files, and update spreadsheets on your behalf.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. All messages are encrypted via WhatsApp\u2019s end-to-end encryption. Each user gets an isolated environment, and your data is never shared with third parties or used for AI training.",
  },
  {
    q: "Can I send files and images?",
    a: "Absolutely. Send images, PDFs, Word documents, Excel spreadsheets, and audio. Swayat can analyze, summarize, and work with all of them.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit/debit cards and UPI payments. Enterprise plans can be invoiced directly.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-bold text-heading sm:text-4xl">
          Frequently Asked <span className="text-primary">Questions</span>
        </h2>
        <div className="mt-12 divide-y divide-slate-200">
          {faqs.map((faq, i) => (
            <div key={i}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between py-5 text-left"
              >
                <span className="text-base font-medium text-heading sm:text-lg">
                  {faq.q}
                </span>
                <span className="ml-4 shrink-0 text-xl text-muted">
                  {open === i ? "\u2212" : "+"}
                </span>
              </button>
              {open === i && (
                <p className="pb-5 text-sm leading-relaxed text-body">
                  {faq.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
