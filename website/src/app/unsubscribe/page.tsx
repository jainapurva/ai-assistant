import { addUnsubscribedEmail } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/email";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Unsubscribe | Swayat AI",
  description: "Unsubscribe from Swayat AI emails.",
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const params = await searchParams;
  const email = params.email;
  const token = params.token;

  let status: "ok" | "invalid" | "error" = "ok";

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    status = "invalid";
  } else {
    try {
      await addUnsubscribedEmail(email);
    } catch (err) {
      console.error("[unsubscribe page] failed:", err);
      status = "error";
    }
  }

  return (
    <>
      <Header />
      <main className="min-h-screen pt-24 pb-16 flex items-center justify-center">
        <div className="max-w-md mx-auto px-6 text-center">
          {status === "ok" && (
            <>
              <h1 className="text-2xl font-semibold mb-4 text-slate-900">
                You&rsquo;ve been unsubscribed
              </h1>
              <p className="text-slate-600 leading-relaxed">
                We won&rsquo;t send any more emails to <strong>{email}</strong>.
                If this was a mistake, just reply to any of our previous emails
                and we&rsquo;ll get you re-added.
              </p>
            </>
          )}
          {status === "invalid" && (
            <>
              <h1 className="text-2xl font-semibold mb-4 text-slate-900">
                Invalid unsubscribe link
              </h1>
              <p className="text-slate-600 leading-relaxed">
                This link is missing or invalid. If you&rsquo;d like to
                unsubscribe, reply to any email from us with &ldquo;unsubscribe&rdquo;.
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="text-2xl font-semibold mb-4 text-slate-900">
                Something went wrong
              </h1>
              <p className="text-slate-600 leading-relaxed">
                We couldn&rsquo;t process your unsubscribe request. Please try
                again, or email apurva@swayat.com.
              </p>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
