import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — Swayat",
  description:
    "Privacy Policy for Swayat, your personal AI assistant on WhatsApp.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="space-y-3 text-gray-300 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">
          Privacy Policy
        </h1>
        <p className="mb-12 text-sm text-gray-500">
          Last updated: March 3, 2026
        </p>

        <div className="space-y-10">
          <Section title="1. Introduction">
            <p>
              Swayat (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
              operates an AI-powered assistant accessible through WhatsApp
              (&quot;the Service&quot;). This Privacy Policy explains how we
              collect, use, store, and protect your information when you interact
              with our Service.
            </p>
            <p>
              By using the Service, you agree to the collection and use of
              information in accordance with this policy.
            </p>
          </Section>

          <Section title="2. Information We Collect">
            <p>We collect the following information when you use our Service:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Phone number</strong> — Your
                WhatsApp phone number, provided when you message us or sign up
                on our website. Used to identify your account and deliver
                responses.
              </li>
              <li>
                <strong className="text-white">Message content</strong> —
                The text, images, and files you send to the Service through
                WhatsApp. Used to generate AI-powered responses.
              </li>
              <li>
                <strong className="text-white">Conversation history</strong> —
                Your past messages within an active session, used to maintain
                context so the assistant can provide relevant follow-up
                responses.
              </li>
              <li>
                <strong className="text-white">Display name</strong> — An
                optional name you choose to register, used to personalize your
                experience.
              </li>
              <li>
                <strong className="text-white">Usage data</strong> — Basic
                interaction metrics such as message counts and token usage,
                used for service management and quality improvement.
              </li>
            </ul>
            <p>
              We do <strong className="text-white">not</strong> collect your
              WhatsApp profile photo, status, contacts list, or any information
              from other conversations.
            </p>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Process your messages and generate AI-powered responses.
              </li>
              <li>
                Maintain conversation context within your active session.
              </li>
              <li>
                Provide and improve the Service, including troubleshooting and
                performance monitoring.
              </li>
              <li>
                Send you service-related notifications (e.g., scheduled task
                results you have requested).
              </li>
            </ul>
            <p>
              We do <strong className="text-white">not</strong> use your data
              for advertising, profiling, or any purpose unrelated to delivering
              the Service.
            </p>
          </Section>

          <Section title="4. Data Sharing and Third Parties">
            <p>
              We do not sell, rent, or trade your personal information. Your
              data may be shared with the following third-party services solely
              to operate the Service:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Meta (WhatsApp)</strong> —
                Messages are sent and received through Meta&apos;s WhatsApp
                Cloud API. Meta&apos;s use of your data is governed by{" "}
                <a
                  href="https://www.whatsapp.com/legal/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-light underline transition hover:text-primary"
                >
                  WhatsApp&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Anthropic (Claude AI)</strong> —
                Your message content is processed by Anthropic&apos;s Claude AI
                to generate responses. Anthropic&apos;s data practices are
                governed by{" "}
                <a
                  href="https://www.anthropic.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-light underline transition hover:text-primary"
                >
                  Anthropic&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong className="text-white">Google (optional)</strong> — If
                you connect your Google account, the Service may access Google
                APIs (Gmail, Drive, Sheets, Calendar) on your behalf. This
                access is governed by{" "}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-light underline transition hover:text-primary"
                >
                  Google&apos;s Privacy Policy
                </a>
                .
              </li>
            </ul>
            <p>
              We may also disclose your information if required to do so by law
              or in response to valid legal requests by public authorities.
            </p>
          </Section>

          <Section title="5. Data Storage and Security">
            <p>
              Your data is stored on our own secure infrastructure. We implement
              appropriate technical and organizational measures to protect your
              information against unauthorized access, alteration, disclosure,
              or destruction, including:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Isolated per-user sandboxed environments for processing.
              </li>
              <li>Encrypted connections for all data in transit.</li>
              <li>
                Access controls limiting data access to authorized systems only.
              </li>
            </ul>
            <p>
              While we strive to protect your information, no method of
              electronic storage or transmission is 100% secure. We cannot
              guarantee absolute security.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p>
              We retain your data only as long as necessary to provide the
              Service:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Conversation history</strong> is
                tied to your active session. When you reset your session (via
                the <code className="rounded bg-surface-light px-1.5 py-0.5 text-sm">/reset</code> command), your conversation history is
                permanently deleted.
              </li>
              <li>
                <strong className="text-white">Account information</strong>{" "}
                (phone number, display name) is retained while your account is
                active. You may request deletion at any time.
              </li>
              <li>
                <strong className="text-white">Sandbox workspace files</strong>{" "}
                that you create during interactions are stored in your isolated
                environment and can be deleted by you at any time using
                the <code className="rounded bg-surface-light px-1.5 py-0.5 text-sm">/sandbox clean</code> command.
              </li>
            </ul>
          </Section>

          <Section title="7. Your Rights">
            <p>You have the right to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong className="text-white">Access</strong> — Request a
                copy of the personal data we hold about you.
              </li>
              <li>
                <strong className="text-white">Deletion</strong> — Request
                that we delete your personal data. You can also delete your
                conversation and workspace data yourself using
                the <code className="rounded bg-surface-light px-1.5 py-0.5 text-sm">/reset</code> and <code className="rounded bg-surface-light px-1.5 py-0.5 text-sm">/sandbox clean</code> commands.
              </li>
              <li>
                <strong className="text-white">Correction</strong> — Request
                that we correct any inaccurate personal data.
              </li>
              <li>
                <strong className="text-white">Withdraw consent</strong> — Stop
                using the Service at any time. You may also request complete
                account removal.
              </li>
            </ul>
            <p>
              To exercise any of these rights, please contact us using the
              details below.
            </p>
          </Section>

          <Section title="8. Children's Privacy">
            <p>
              The Service is not intended for use by anyone under the age of 13.
              We do not knowingly collect personal information from children
              under 13. If we become aware that we have collected personal data
              from a child under 13, we will take steps to delete that
              information promptly.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. When we make
              changes, we will update the &quot;Last updated&quot; date at the
              top of this page. We encourage you to review this policy
              periodically for any changes. Continued use of the Service after
              changes constitutes acceptance of the updated policy.
            </p>
          </Section>

          <Section title="10. Contact Us">
            <p>
              If you have any questions about this Privacy Policy or wish to
              exercise your data rights, please contact us at:
            </p>
            <p>
              <a
                href="mailto:privacy@swayat.com"
                className="text-primary-light underline transition hover:text-primary"
              >
                privacy@swayat.com
              </a>
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
