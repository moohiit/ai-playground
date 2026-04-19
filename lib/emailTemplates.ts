import { APP_URL, renderBrandedEmail, sendEmail } from "./email";

export async function sendVerificationEmail(opts: {
  to: string;
  name: string;
  token: string;
}): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(opts.token)}`;
  const html = renderBrandedEmail({
    heading: `Welcome, ${escapeHtml(opts.name)} — confirm your email`,
    bodyHtml: `<p>Thanks for signing up for AI Playground. Click the button below to verify your email address and unlock the projects.</p>
      <p style="font-size:12px;color:#a1a1aa;">This link expires in 24 hours.</p>`,
    ctaLabel: "Verify email",
    ctaHref: link,
    footerNote: `If the button doesn't work, paste this URL into your browser:<br><span style="color:#a5b4fc;word-break:break-all;">${link}</span>`,
  });
  await sendEmail({
    to: opts.to,
    subject: "Verify your AI Playground email",
    html,
  });
}

export async function sendPendingEmailChangeEmail(opts: {
  to: string;
  name: string;
  token: string;
}): Promise<void> {
  const link = `${APP_URL}/verify-email?token=${encodeURIComponent(opts.token)}&mode=change`;
  const html = renderBrandedEmail({
    heading: "Confirm your new email address",
    bodyHtml: `<p>Hi ${escapeHtml(opts.name)}, you asked to change your AI Playground email to this address. Click the button below to confirm the change.</p>
      <p style="font-size:12px;color:#a1a1aa;">This link expires in 24 hours. Your old email stays active until you confirm.</p>`,
    ctaLabel: "Confirm new email",
    ctaHref: link,
    footerNote: `If the button doesn't work, paste this URL into your browser:<br><span style="color:#a5b4fc;word-break:break-all;">${link}</span>`,
  });
  await sendEmail({
    to: opts.to,
    subject: "Confirm your new AI Playground email",
    html,
  });
}

export async function sendPasswordResetOtpEmail(opts: {
  to: string;
  name: string;
  otp: string;
}): Promise<void> {
  const html = renderBrandedEmail({
    heading: "Your password reset code",
    bodyHtml: `<p>Hi ${escapeHtml(opts.name)}, use the code below to reset your AI Playground password.</p>
      <div style="margin:24px 0;padding:16px 20px;border:1px solid #27272a;border-radius:10px;background:#18181b;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:26px;letter-spacing:0.4em;color:#fafafa;text-align:center;">${opts.otp}</div>
      <p style="font-size:12px;color:#a1a1aa;">This code expires in 15 minutes. If you didn't request a reset, you can safely ignore this email.</p>`,
  });
  await sendEmail({
    to: opts.to,
    subject: "Your AI Playground password reset code",
    html,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
