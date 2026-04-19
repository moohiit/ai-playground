import nodemailer, { type Transporter } from "nodemailer";

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  (EMAIL_USER ? `AI Playground <${EMAIL_USER}>` : undefined);
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT
  ? Number(process.env.SMTP_PORT)
  : undefined;

const RAW_APP_URL = process.env.APP_URL || "http://localhost:3000";
export const APP_URL = RAW_APP_URL.startsWith("http")
  ? RAW_APP_URL.replace(/\/$/, "")
  : `https://${RAW_APP_URL.replace(/\/$/, "")}`;

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  if (!EMAIL_USER || !EMAIL_PASS) return null;

  const host = SMTP_HOST ?? "smtp.gmail.com";
  const port = SMTP_PORT ?? 465;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  return cachedTransporter;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const transporter = getTransporter();

  if (!transporter) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Email is not configured: EMAIL_USER and EMAIL_PASS must be set"
      );
    }
    console.warn(
      "[email] SMTP not configured — logging email instead of sending",
      {
        to: input.to,
        subject: input.subject,
        text: input.text ?? stripHtml(input.html),
      }
    );
    return;
  }

  if (!EMAIL_FROM) {
    throw new Error("EMAIL_FROM could not be resolved from env");
  }

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text ?? stripHtml(input.html),
  });
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
