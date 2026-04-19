import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/shared/Providers";
import { SiteHeader } from "@/components/shared/SiteHeader";

const rawAppUrl = process.env.APP_URL || "http://localhost:3000";
const metadataBase = new URL(
  rawAppUrl.startsWith("http") ? rawAppUrl : `https://${rawAppUrl}`
);

export const metadata: Metadata = {
  metadataBase,
  title: "AI Playground",
  description:
    "A collection of Generative AI projects in one place — resume matching, SQL generation, expense tracking, and more.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
            <SiteHeader />
            <main className="flex-1 py-8">{children}</main>
            <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-500">
              Built with Next.js, Tailwind & Gemini — free tier friendly.
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
