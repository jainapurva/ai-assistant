import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getBlogPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — Swayat AI | WhatsApp Business Tools & AI Insights",
  description:
    "Expert guides on WhatsApp Business API, AI chatbots for real estate, CRM tools, and automation strategies for businesses. Practical tips from Swayat AI.",
  keywords: [
    "WhatsApp business blog",
    "WhatsApp AI chatbot guides",
    "real estate WhatsApp tools",
    "WhatsApp Business API",
    "WhatsApp CRM blog",
    "AI for small business",
  ],
  alternates: {
    canonical: "https://swayat.com/blog",
  },
  openGraph: {
    title: "Blog — Swayat AI | WhatsApp Business Tools & AI Insights",
    description:
      "Expert guides on WhatsApp Business API, AI chatbots, CRM tools, and automation strategies for businesses.",
    url: "https://swayat.com/blog",
    siteName: "Swayat AI",
    type: "website",
    locale: "en_US",
  },
};

const categoryColors: Record<string, string> = {
  "Real Estate": "bg-indigo-100 text-indigo-700",
  "WhatsApp Business": "bg-cyan-100 text-cyan-700",
  CRM: "bg-emerald-100 text-emerald-700",
};

const categoryGradients: Record<string, string> = {
  "Real Estate": "from-indigo-500 to-purple-600",
  "WhatsApp Business": "from-cyan-500 to-blue-600",
  CRM: "from-emerald-500 to-teal-600",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogPage() {
  const posts = getBlogPosts();

  return (
    <>
      <Header />
      <main className="pt-24 pb-16">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-12">
          <h1 className="text-4xl font-bold tracking-tight text-heading sm:text-5xl">
            Blog
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-body">
            Practical guides on WhatsApp Business tools, AI automation, and
            strategies for growing your business.
          </p>
        </section>

        {/* Post Grid */}
        <section className="mx-auto max-w-6xl px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <a
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-surface transition hover:shadow-lg hover:border-primary/30"
              >
                {/* Gradient placeholder */}
                <div
                  className={`h-44 bg-gradient-to-br ${categoryGradients[post.category] || "from-primary to-primary-dark"} flex items-center justify-center`}
                >
                  <span className="text-5xl opacity-80">
                    {post.category === "Real Estate"
                      ? "\u{1F3E0}"
                      : post.category === "WhatsApp Business"
                        ? "\u{1F4F1}"
                        : "\u{1F4CA}"}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5">
                  {/* Category + Read time */}
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-0.5 text-xs font-medium ${categoryColors[post.category] || "bg-slate-100 text-slate-700"}`}
                    >
                      {post.category}
                    </span>
                    <span className="text-xs text-muted">{post.readTime}</span>
                  </div>

                  {/* Title */}
                  <h2 className="mt-3 text-lg font-semibold leading-snug text-heading group-hover:text-primary transition">
                    {post.title}
                  </h2>

                  {/* Description */}
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-body line-clamp-3">
                    {post.description}
                  </p>

                  {/* Date */}
                  <time
                    dateTime={post.date}
                    className="mt-4 block text-xs text-muted"
                  >
                    {formatDate(post.date)}
                  </time>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
