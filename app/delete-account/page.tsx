import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete Your Account & Data · Expense Tracker",
  description:
    "How to delete your Expense Tracker account and data, what is removed, and how long it takes.",
};

const CONTACT = "pmohit645@gmail.com";

export default function DeleteAccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-2 py-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-100">
        Delete your account &amp; data
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Expense Tracker (part of AI Playground), operated by Mohit Patel
      </p>

      <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-zinc-300">
        <section>
          <p>
            This page explains how to delete data or your entire account in the
            Expense Tracker app.
          </p>
        </section>

        <Section title="Delete specific data (without deleting your account)">
          <p>You can remove your data directly inside the app at any time:</p>
          <ul className="ml-5 mt-2 list-disc space-y-1.5">
            <li>
              <b>Delete an expense:</b> open the Expenses list, find the expense,
              and tap <b>Delete</b>.
            </li>
            <li>
              <b>Delete a group</b> (and all of its expenses): open the group and
              tap <b>Delete Group</b>.
            </li>
          </ul>
          <p className="mt-2">
            These changes are permanent and take effect immediately.
          </p>
        </Section>

        <Section title="Delete your entire account">
          <p>
            <b>In the app (fastest):</b> open the <b>Settings</b> tab, find the{" "}
            <b>Account</b> section, tap <b>Delete account</b>, and confirm. Your
            account and data are removed immediately.
          </p>
          <p className="mt-3">Or request it by email:</p>
          <ol className="ml-5 mt-2 list-decimal space-y-1.5">
            <li>
              Send an email to{" "}
              <a className="text-brand-400 underline" href={`mailto:${CONTACT}?subject=Delete%20my%20Expense%20Tracker%20account`}>
                {CONTACT}
              </a>{" "}
              <b>from the email address registered to your account</b>.
            </li>
            <li>
              Use the subject line <b>&ldquo;Delete my Expense Tracker
              account&rdquo;</b>.
            </li>
            <li>
              We verify the request and delete your account within{" "}
              <b>30 days</b>, then send you a confirmation.
            </li>
          </ol>
        </Section>

        <Section title="What is deleted">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>Your account details — name, email address, and password.</li>
            <li>All of your personal expenses.</li>
            <li>Groups you created and the expenses within them.</li>
            <li>Any extracted receipt data associated with your expenses.</li>
          </ul>
          <p className="mt-3">
            Note: expenses you added to a shared group remain visible to that
            group&rsquo;s other members for their records, with your name
            retained only as the original payer where required for balance
            accuracy. Receipt <b>images</b> are never stored — they are processed
            in memory at scan time and discarded.
          </p>
        </Section>

        <Section title="What is kept, and for how long">
          <p>
            We do not retain your personal data after deletion. Residual copies
            in encrypted backups are purged within <b>90 days</b>. We keep no data
            for advertising or sale.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            Contact us at{" "}
            <a className="text-brand-400 underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            . See also our{" "}
            <a className="text-brand-400 underline" href="/privacy">
              Privacy Policy
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
