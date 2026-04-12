import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/shared/Providers";
import { NavAuth } from "@/components/shared/NavAuth";

export const metadata: Metadata = {
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
            <header className="flex items-center justify-between py-6">
              <a href="/" className="text-lg font-semibold tracking-tight">
                AI <span className="text-brand-500">Playground</span>
              </a>
              <nav className="flex items-center gap-4 text-sm text-zinc-400">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-zinc-100"
                >
                  GitHub
                </a>
                <NavAuth />
              </nav>
            </header>
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
