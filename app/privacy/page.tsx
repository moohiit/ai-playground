import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy · Splitzy AI (Expense Tracker)",
  description:
    "Privacy policy for the Splitzy AI expense tracker app — what data we collect, how it's used, and your choices.",
};

const UPDATED = "June 3, 2026";
const CONTACT = "pmohit645@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-2 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
        Privacy Policy
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Expense Tracker (part of AI Playground) · Last updated {UPDATED}
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p>
            This Privacy Policy explains how the Expense Tracker application
            (the &ldquo;App&rdquo;), operated by Mohit Patel
            (&ldquo;we&rdquo;, &ldquo;us&rdquo;), collects, uses, and protects
            your information when you use the App and its related services. By
            using the App you agree to this policy.
          </p>
        </section>

        <Section title="Information we collect">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              <b>Account information.</b> Your name, email address, and a
              password (stored only as a securely hashed value, never in plain
              text).
            </li>
            <li>
              <b>Expense data.</b> The expenses you create — amounts,
              descriptions, categories, dates, who paid, and how a group expense
              is split.
            </li>
            <li>
              <b>Group data.</b> Groups you create and the members you add by
              email, including their names and email addresses, so balances and
              splits can be calculated.
            </li>
            <li>
              <b>Receipt images.</b> If you use the receipt-scan feature, the
              photo you capture or select is sent to Google&rsquo;s Gemini API to
              extract details (vendor, total, date, line items). We store the
              extracted text, not the image itself.
            </li>
            <li>
              <b>Technical data.</b> Basic request data needed to operate and
              secure the service (e.g. authentication tokens).
            </li>
          </ul>
        </Section>

        <Section title="How we use your information">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>To create and manage your account and authenticate you.</li>
            <li>To store, display, and report on your personal and group expenses.</li>
            <li>To extract expense details from receipt images you scan.</li>
            <li>
              To send transactional emails (email verification and password
              reset codes).
            </li>
            <li>To maintain the security and integrity of the service.</li>
          </ul>
          <p className="mt-3">
            We do <b>not</b> sell your personal information, and we do not use it
            for advertising.
          </p>
        </Section>

        <Section title="Third-party services">
          <p>We rely on the following providers to operate the App:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1.5">
            <li>
              <b>Google Gemini API</b> — processes receipt images you choose to
              scan to extract expense details.
            </li>
            <li>
              <b>MongoDB</b> — securely stores your account and expense data.
            </li>
            <li>
              <b>Vercel</b> — hosts the backend that the App communicates with.
            </li>
            <li>
              <b>Email delivery provider</b> — sends verification and password-
              reset emails.
            </li>
          </ul>
          <p className="mt-3">
            These providers process data only as needed to deliver their part of
            the service.
          </p>
        </Section>

        <Section title="Data security">
          <p>
            All traffic between the App and our servers is encrypted in transit
            using HTTPS. Passwords are hashed with bcrypt and are never stored or
            transmitted in plain text. Access to your data requires a valid
            authentication token tied to your account.
          </p>
        </Section>

        <Section title="Data retention & deletion">
          <p>
            Your data is retained while your account is active. You can delete
            individual expenses and groups from within the App at any time. To
            request deletion of your entire account and associated data, email us
            at{" "}
            <a className="text-brand-400 underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>{" "}
            and we will process the request within 30 days.
          </p>
        </Section>

        <Section title="Children's privacy">
          <p>
            The App is not directed to children under 13, and we do not knowingly
            collect personal information from children under 13.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. Material changes
            will be reflected by updating the &ldquo;Last updated&rdquo; date at
            the top of this page.
          </p>
        </Section>

        <Section title="Contact us">
          <p>
            For any questions about this policy or your data, contact us at{" "}
            <a className="text-brand-400 underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}
