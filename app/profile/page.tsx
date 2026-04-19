import Link from "next/link";
import { ProfileClient } from "./ProfileClient";

export const metadata = {
  title: "Profile · AI Playground",
  description: "Manage your account, photo, usage, and password.",
};

export default function ProfilePage() {
  return (
    <div className="relative flex flex-col gap-10">
      <div className="pointer-events-none absolute inset-x-0 -top-20 -z-10 h-[320px] bg-grid bg-radial-fade opacity-60" />

      <header className="flex flex-col gap-3 animate-fade-up">
        <Link
          href="/"
          className="group inline-flex w-fit items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-brand-500"
        >
          <span className="transition-transform group-hover:-translate-x-1">
            ←
          </span>
          Back to home
        </Link>
        <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Your <span className="text-gradient-brand">profile</span>
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
          Manage your account details, change your email or password, and see
          how much you&apos;ve used each project this month.
        </p>
      </header>

      <ProfileClient />
    </div>
  );
}
