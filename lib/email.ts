import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "AI Playground <onboarding@resend.dev>";

const RAW_APP_URL = process.env.APP_URL || "http://localhost:3000";
export const APP_URL = RAW_APP_URL.startsWith("http")
  ? RAW_APP_URL.replace(/\/$/, "")
  : `https://${RAW_APP_URL.replace(/\/$/, "")}`;

let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  if (cachedClient) return cachedClient;
  if (!RESEND_API_KEY) return null;
  cachedClient = new Resend(RESEND_API_KEY);
  return cachedClient;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const client = getClient();

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email is not configured: RESEND_API_KEY must be set");
    }
    console.warn(
      "[email] RESEND_API_KEY not set — logging email instead of sending",
      {
        to: input.to,
        subject: input.subject,
        text: input.text ?? stripHtml(input.html),
      }
    );
    return;
  }

  const { error } = await client.emails.send({
    from: EMAIL_FROM,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text ?? stripHtml(input.html),
  });

  if (error) {
    throw new Error(
      `Resend send failed: ${error.name ?? ""} ${error.message ?? ""}`.trim()
    );
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderBrandedEmail(opts: {
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaHref?: string;
  footerNote?: string;
}): string {
  const cta =
    opts.ctaLabel && opts.ctaHref
      ? `<div style="margin:28px 0;">
           <a href="${opts.ctaHref}"
              style="display:inline-block;background:linear-gradient(90deg,#4f46e5,#d946ef);color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">
             ${opts.ctaLabel}
           </a>
         </div>`
      : "";

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e4e4e7;">
    <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
      <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#a1a1aa;margin-bottom:16px;">AI Playground</div>
      <h1 style="font-size:22px;font-weight:700;color:#fafafa;margin:0 0 18px;">${opts.heading}</h1>
      <div style="font-size:14px;line-height:1.6;color:#d4d4d8;">${opts.bodyHtml}</div>
      ${cta}
      ${
        opts.footerNote
          ? `<p style="margin-top:28px;font-size:12px;color:#71717a;">${opts.footerNote}</p>`
          : ""
      }
      <hr style="border:none;border-top:1px solid #27272a;margin:32px 0 16px;" />
      <div style="font-size:11px;color:#52525b;">You're receiving this because an action was requested from your AI Playground account. If you didn't make this request, you can ignore this email.</div>
    </div>
  </body>
</html>`;
}
