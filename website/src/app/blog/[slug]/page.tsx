import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getBlogPost, getBlogPosts } from "@/lib/blog";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post Not Found" };

  const url = `https://swayat.com/blog/${post.slug}`;

  return {
    title: `${post.title} | Swayat AI Blog`,
    description: post.description,
    keywords: post.keywords,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      siteName: "Swayat AI",
      type: "article",
      locale: "en_IN",
      publishedTime: post.date,
      authors: ["Swayat AI"],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

const categoryColors: Record<string, string> = {
  "Real Estate": "bg-indigo-100 text-indigo-700",
  "WhatsApp Business": "bg-cyan-100 text-cyan-700",
  CRM: "bg-emerald-100 text-emerald-700",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  // Get related posts (same category first, then others, excluding current)
  const allPosts = getBlogPosts();
  const related = [
    ...allPosts.filter((p) => p.category === post.category && p.slug !== slug),
    ...allPosts.filter((p) => p.category !== post.category && p.slug !== slug),
  ].slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: {
      "@type": "Organization",
      name: "Swayat AI",
      url: "https://swayat.com",
    },
    publisher: {
      "@type": "Organization",
      name: "Swayat AI",
      url: "https://swayat.com",
      logo: {
        "@type": "ImageObject",
        url: "https://swayat.com/logo-512.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://swayat.com/blog/${post.slug}`,
    },
    keywords: post.keywords.join(", "),
  };

  return (
    <>
      <Header />
      <main className="pt-24 pb-16">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        <article className="mx-auto max-w-3xl px-6">
          {/* Back link */}
          <a
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to Blog
          </a>

          {/* Header */}
          <header className="mt-6 mb-10">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`rounded-full px-3 py-0.5 text-xs font-medium ${categoryColors[post.category] || "bg-slate-100 text-slate-700"}`}
              >
                {post.category}
              </span>
              <span className="text-sm text-muted">{post.readTime}</span>
              <time dateTime={post.date} className="text-sm text-muted">
                {formatDate(post.date)}
              </time>
            </div>

            <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-heading sm:text-4xl">
              {post.title}
            </h1>

            <p className="mt-4 text-lg text-body">{post.description}</p>
          </header>

          {/* Article body */}
          <div
            className="prose prose-slate max-w-none
              prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-heading
              prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-2xl
              prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-xl
              prose-p:text-body prose-p:leading-relaxed prose-p:mb-4
              prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline
              prose-strong:text-heading prose-strong:font-semibold
              prose-ul:my-4 prose-ul:pl-6 prose-li:text-body prose-li:mb-1.5
              prose-ol:my-4 prose-ol:pl-6
              prose-table:my-6 prose-table:w-full prose-table:text-sm
              prose-thead:border-b-2 prose-thead:border-slate-200
              prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:text-heading prose-th:bg-surface-light
              prose-td:px-4 prose-td:py-2.5 prose-td:border-b prose-td:border-slate-100 prose-td:text-body
              prose-em:text-body"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        </article>

        {/* Related Posts */}
        {related.length > 0 && (
          <section className="mx-auto mt-16 max-w-3xl border-t border-slate-200 px-6 pt-12">
            <h2 className="text-2xl font-bold text-heading">
              Related Articles
            </h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {related.map((r) => (
                <a
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="group rounded-xl border border-slate-200 p-4 transition hover:shadow-md hover:border-primary/30"
                >
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${categoryColors[r.category] || "bg-slate-100 text-slate-700"}`}
                  >
                    {r.category}
                  </span>
                  <h3 className="mt-2 text-sm font-semibold leading-snug text-heading group-hover:text-primary transition line-clamp-3">
                    {r.title}
                  </h3>
                  <time
                    dateTime={r.date}
                    className="mt-2 block text-xs text-muted"
                  >
                    {formatDate(r.date)}
                  </time>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
