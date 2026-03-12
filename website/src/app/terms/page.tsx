import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — Swayat",
  description: "Terms of Service for Swayat, your personal AI assistant on WhatsApp.",
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
      <h2 className="text-xl font-semibold text-heading">{title}</h2>
      <div className="space-y-3 text-body leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsOfService() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-6 pb-24 pt-32">
        <h1 className="mb-2 text-4xl font-bold tracking-tight">
          Terms of Service
        </h1>
        <p className="mb-12 text-sm text-gray-500">
          Last updated: March 3, 2026
        </p>

        <div className="space-y-10">
          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using Swayat (&quot;the Service&quot;), operated
              by Swayat (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;),
              you agree to be bound by these Terms of Service. If you do not
              agree to these terms, do not use the Service.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              Swayat is an AI-powered assistant accessible through WhatsApp. The
              Service processes your messages using artificial intelligence to
              provide helpful responses, including but not limited to answering
              questions, drafting content, performing research, managing emails,
              and executing tasks on your behalf.
            </p>
            <p>
              The Service is provided via Meta&apos;s WhatsApp platform. Your
              use of WhatsApp is subject to{" "}
              <a
                href="https://www.whatsapp.com/legal/terms-of-service"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline transition hover:text-primary"
              >
                WhatsApp&apos;s Terms of Service
              </a>
              .
            </p>
          </Section>

          <Section title="3. Eligibility">
            <p>
              You must be at least 13 years old to use the Service. By using the
              Service, you represent that you meet this age requirement. If you
              are under 18, you must have permission from a parent or legal
              guardian.
            </p>
          </Section>

          <Section title="4. Account and Registration">
            <p>
              To use the Service, you message our WhatsApp Business number. You
              may optionally register a display name. You are responsible for
              all activity that occurs through your WhatsApp number when
              interacting with the Service.
            </p>
          </Section>

          <Section title="5. Acceptable Use">
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Violate any applicable laws, regulations, or third-party rights.
              </li>
              <li>
                Generate, request, or distribute harmful, abusive, threatening,
                defamatory, or illegal content.
              </li>
              <li>
                Attempt to reverse-engineer, exploit, or compromise the
                Service&apos;s systems or infrastructure.
              </li>
              <li>
                Impersonate any person or entity, or misrepresent your
                affiliation with any person or entity.
              </li>
              <li>
                Send spam, bulk messages, or use the Service for unauthorized
                commercial purposes.
              </li>
              <li>
                Attempt to bypass any usage limits, access controls, or security
                measures.
              </li>
              <li>
                Use the Service to harm minors in any way.
              </li>
            </ul>
            <p>
              We reserve the right to suspend or terminate access for users who
              violate these terms.
            </p>
          </Section>

          <Section title="6. AI-Generated Content">
            <p>
              The Service uses artificial intelligence to generate responses.
              You acknowledge and agree that:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                AI-generated responses may not always be accurate, complete, or
                up to date. You should independently verify important
                information before relying on it.
              </li>
              <li>
                The Service does not provide professional advice (legal,
                medical, financial, or otherwise). AI responses should not be
                treated as a substitute for qualified professional consultation.
              </li>
              <li>
                You are solely responsible for how you use any content or
                information generated by the Service.
              </li>
            </ul>
          </Section>

          <Section title="7. Intellectual Property">
            <p>
              The Service, including its design, features, and underlying
              technology, is owned by Swayat and protected by applicable
              intellectual property laws. You retain ownership of the content
              you send to the Service. You may use AI-generated responses for
              your personal or business purposes.
            </p>
          </Section>

          <Section title="8. Privacy">
            <p>
              Your use of the Service is also governed by our{" "}
              <a
                href="/privacy"
                className="text-primary underline transition hover:text-primary"
              >
                Privacy Policy
              </a>
              , which describes how we collect, use, and protect your
              information. By using the Service, you consent to the practices
              described in the Privacy Policy.
            </p>
          </Section>

          <Section title="9. Service Availability">
            <p>
              We strive to keep the Service available at all times, but we do
              not guarantee uninterrupted or error-free operation. The Service
              may be temporarily unavailable due to maintenance, updates, or
              circumstances beyond our control. We reserve the right to modify,
              suspend, or discontinue the Service at any time without prior
              notice.
            </p>
          </Section>

          <Section title="10. Limitation of Liability">
            <p>
              To the fullest extent permitted by law, Swayat and its operators
              shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from your use of the
              Service, including but not limited to:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>Errors or inaccuracies in AI-generated content.</li>
              <li>Loss of data or unauthorized access to your information.</li>
              <li>Service interruptions or unavailability.</li>
              <li>
                Actions taken based on information provided by the Service.
              </li>
            </ul>
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis without warranties of any kind, either
              express or implied.
            </p>
          </Section>

          <Section title="11. Indemnification">
            <p>
              You agree to indemnify and hold harmless Swayat and its operators
              from any claims, damages, losses, or expenses (including
              reasonable legal fees) arising out of your use of the Service or
              violation of these Terms.
            </p>
          </Section>

          <Section title="12. Termination">
            <p>
              We may suspend or terminate your access to the Service at any time
              and for any reason, including violation of these Terms. You may
              stop using the Service at any time. Upon termination, your right
              to use the Service ceases immediately. You may request deletion of
              your data by contacting us.
            </p>
          </Section>

          <Section title="13. Changes to These Terms">
            <p>
              We may update these Terms of Service from time to time. When we
              make changes, we will update the &quot;Last updated&quot; date at
              the top of this page. Continued use of the Service after changes
              constitutes acceptance of the updated terms.
            </p>
          </Section>

          <Section title="14. Contact Us">
            <p>
              If you have any questions about these Terms of Service, please
              contact us at:
            </p>
            <p>
              <a
                href="mailto:support@swayat.com"
                className="text-primary underline transition hover:text-primary"
              >
                support@swayat.com
              </a>
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}
