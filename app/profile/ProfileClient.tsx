"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useAuth } from "@/lib/authContext";
import { cn } from "@/lib/utils";

type ProfileUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  pendingEmail: string | null;
  profilePhotoUrl: string | null;
  createdAt: string;
};

type ProjectUsage = {
  slug: string;
  label: string;
  monthlyCount: number;
  monthlySuccessCount: number;
  monthlyLimit: number;
  defaultMonthlyLimit: number;
  lifetimeCount: number;
};

type ProfilePayload = {
  user: ProfileUser;
  usage: ProjectUsage[];
  monthStart: string;
  monthEnd: string;
};

export function ProfileClient() {
  const { authFetch, refreshUser } = useAuth();
  const [data, setData] = useState<ProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/profile");
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load profile");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Loading profile…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
        {error ?? "Couldn't load profile."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <HeaderCard user={data.user} />

      <div className="grid gap-6 lg:grid-cols-2">
        <PhotoCard
          user={data.user}
          onChange={() => {
            load();
            refreshUser();
          }}
        />
        <NameCard
          user={data.user}
          onChange={() => {
            load();
            refreshUser();
          }}
        />
      </div>

      <EmailCard user={data.user} onChange={load} />

      <PasswordCard />

      <UsageCard usage={data.usage} monthStart={data.monthStart} />
    </div>
  );
}

/* ───────── header ───────── */

function HeaderCard({ user }: { user: ProfileUser }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-6 backdrop-blur-sm sm:flex-row sm:items-center">
      <Avatar url={user.profilePhotoUrl} name={user.name} size={72} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-xl font-semibold text-zinc-100">
          {user.name}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
          <span className="truncate">{user.email}</span>
          {user.emailVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-400 ring-1 ring-emerald-500/30">
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/30">
              Unverified
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500">
          Joined{" "}
          {new Date(user.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
    </div>
  );
}

function Avatar({
  url,
  name,
  size,
}: {
  url: string | null;
  name: string;
  size: number;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className="rounded-2xl border border-zinc-800 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500/30 to-fuchsia-500/30 text-lg font-semibold text-zinc-100 ring-1 ring-zinc-800"
      style={{ width: size, height: size }}
    >
      {initials || "?"}
    </div>
  );
}

/* ───────── photo ───────── */

function PhotoCard({
  user,
  onChange,
}: {
  user: ProfileUser;
  onChange: () => void;
}) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await authFetch("/api/profile/photo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/profile/photo", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Remove failed");
      }
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Profile photo" hint="JPEG, PNG, or WebP — up to 4 MB">
      <div className="flex items-center gap-4">
        <Avatar url={user.profilePhotoUrl} name={user.name} size={64} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-medium text-brand-400 transition hover:bg-brand-500/20 disabled:opacity-50"
          >
            {busy ? <Spinner /> : null}
            {user.profilePhotoUrl ? "Replace" : "Upload"}
          </button>
          {user.profilePhotoUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          className="hidden"
        />
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </Card>
  );
}

/* ───────── name ───────── */

function NameCard({
  user,
  onChange,
}: {
  user: ProfileUser;
  onChange: () => void;
}) {
  const { authFetch } = useAuth();
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (name.trim() === user.name) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      const res = await authFetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      setSaved(true);
      onChange();
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Display name">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || name.trim() === user.name || name.trim().length === 0}
            className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Spinner /> : null} Save
          </button>
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>
    </Card>
  );
}

/* ───────── email ───────── */

function EmailCard({
  user,
  onChange,
}: {
  user: ProfileUser;
  onChange: () => void;
}) {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await authFetch("/api/profile/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail: newEmail.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Change failed");
      setMessage(data.message ?? "Confirmation email sent.");
      setNewEmail("");
      setPassword("");
      setOpen(false);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelPending() {
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch("/api/profile/change-email", {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Cancel failed");
      }
      setMessage("Pending email change canceled.");
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Email"
      hint="Changes require confirming the new address via a link we send."
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-zinc-200">{user.email}</div>
          {!open && !user.pendingEmail && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-brand-500/40 hover:text-brand-300"
            >
              Change email
            </button>
          )}
        </div>

        {user.pendingEmail && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            <div className="font-medium">Pending change to {user.pendingEmail}</div>
            <div className="mt-1 text-amber-200/80">
              We emailed a confirmation link. Your address stays the same until
              you click it.
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={handleCancelPending}
                disabled={busy}
                className="rounded-md border border-amber-500/40 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
              >
                Cancel change
              </button>
            </div>
          </div>
        )}

        {open && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
              required
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Current password (to confirm it's you)"
              required
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? <Spinner /> : null} Send confirmation link
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setNewEmail("");
                  setPassword("");
                  setError(null);
                }}
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {message && <p className="text-xs text-emerald-400">{message}</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </Card>
  );
}

/* ───────── password ───────── */

function PasswordCard() {
  const { authFetch } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await authFetch("/api/profile/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Change failed");
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Change failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Password">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-400">
            Last changed recently. For stronger security, use a unique password.
          </div>
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-brand-500/40 hover:text-brand-300"
            >
              Change password
            </button>
          )}
        </div>

        {open && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              required
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 chars)"
              required
              minLength={6}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {busy ? <Spinner /> : null} Update password
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setError(null);
                }}
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {saved && <p className="text-xs text-emerald-400">Password updated.</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </Card>
  );
}

/* ───────── usage ───────── */

function UsageCard({
  usage,
  monthStart,
}: {
  usage: ProjectUsage[];
  monthStart: string;
}) {
  const monthLabel = new Date(monthStart).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
  return (
    <Card
      title="Monthly usage"
      hint={`Requests you've made this month (${monthLabel}). Limits reset on the 1st.`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {usage.map((u) => {
          const pct = u.monthlyLimit > 0
            ? Math.min(100, (u.monthlyCount / u.monthlyLimit) * 100)
            : 0;
          const near = pct >= 80 && pct < 100;
          const at = pct >= 100;
          return (
            <div
              key={u.slug}
              className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-200">{u.label}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    at
                      ? "text-red-400"
                      : near
                      ? "text-amber-400"
                      : "text-zinc-400"
                  )}
                >
                  {u.monthlyCount} / {u.monthlyLimit}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    at
                      ? "bg-red-500"
                      : near
                      ? "bg-amber-500"
                      : "bg-gradient-to-r from-brand-500 to-fuchsia-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] text-zinc-500">
                Lifetime: {u.lifetimeCount}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ───────── primitives ───────── */

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 backdrop-blur-sm">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent"
      aria-hidden
    />
  );
}
