"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../../../lib/authContext";
import { GroupDetail } from "../components/GroupDetail";

type Group = {
  _id: string;
  name: string;
  description: string;
  members: { userId: string; email: string; name: string; isActive: boolean }[];
};

type Invite = {
  _id: string;
  groupName: string;
  invitedBy: { id: string; name: string };
  createdAt: string;
};

export function GroupsTab() {
  const { authFetch } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  async function fetchGroups() {
    setLoading(true);
    try {
      const [gRes, iRes] = await Promise.all([
        authFetch("/api/projects/expense-tracker/groups"),
        authFetch("/api/projects/expense-tracker/invites"),
      ]);
      const data = await gRes.json().catch(() => ({}));
      const iData = await iRes.json().catch(() => ({}));
      setGroups(data.groups ?? []);
      setInvites(iData.invites ?? []);
    } catch {
      // network failure — keep last list; the empty state renders if none
    } finally {
      setLoading(false);
    }
  }

  async function respondInvite(id: string, accept: boolean) {
    if (respondingId) return;
    setRespondingId(id);
    try {
      const res = await authFetch(`/api/projects/expense-tracker/invites/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Couldn't respond to the invite");
      }
      await fetchGroups();
    } catch {
      alert("Network error — try again.");
    } finally {
      setRespondingId(null);
    }
  }

  useEffect(() => {
    fetchGroups();
  }, []);

  if (selectedId) {
    return (
      <GroupDetail
        groupId={selectedId}
        onBack={() => {
          setSelectedId(null);
          fetchGroups();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-brand-500/90">
            Shared
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Groups</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03]"
        >
          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <span className="relative">+ New Group</span>
        </button>
      </div>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          {invites.map((inv) => (
            <div
              key={inv._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-500/40 bg-brand-500/[0.08] px-4 py-3"
            >
              <div className="text-sm text-zinc-200">
                <span className="font-semibold">{inv.invitedBy.name}</span>{" "}
                invited you to join{" "}
                <span className="font-semibold text-brand-300">
                  {inv.groupName}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => respondInvite(inv._id, true)}
                  disabled={respondingId !== null}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {respondingId === inv._id ? "…" : "Accept"}
                </button>
                <button
                  onClick={() => respondInvite(inv._id, false)}
                  disabled={respondingId !== null}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupForm
          onCreated={() => {
            setShowCreate(false);
            fetchGroups();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-zinc-800/60 bg-zinc-900/30"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-12 text-center backdrop-blur-sm">
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="relative mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <p className="relative text-sm text-zinc-400">
            No groups yet. Create one to start splitting expenses.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g, i) => (
            <button
              key={g._id}
              onClick={() => setSelectedId(g._id)}
              className="animate-fade-up group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 text-left backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-brand-500/60 hover:shadow-[0_20px_50px_-15px_rgba(99,102,241,0.4)]"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-100 transition-colors group-hover:text-white">
                    {g.name}
                  </h3>
                  {g.description && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {g.description}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-brand-500 ring-1 ring-brand-500/30">
                  {g.members.length} members
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.members.slice(0, 6).map((m) => (
                  <span
                    key={m.userId}
                    className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-400 transition-colors group-hover:border-brand-500/30"
                  >
                    {m.name}
                  </span>
                ))}
                {g.members.length > 6 && (
                  <span className="rounded-md bg-zinc-800/60 px-2 py-0.5 text-[11px] text-zinc-500">
                    +{g.members.length - 6}
                  </span>
                )}
              </div>
              <div className="mt-auto flex items-center gap-1 pt-2 text-xs font-medium text-brand-500">
                Open
                <span className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGroupForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void;
  onCancel: () => void;
}) {
  const { authFetch } = useAuth();
  const [name, setName] = useState("");
  const [memberEmails, setMemberEmails] = useState(["", ""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addMemberField() {
    setMemberEmails([...memberEmails, ""]);
  }

  function removeMemberField(i: number) {
    setMemberEmails(memberEmails.filter((_, idx) => idx !== i));
  }

  function updateMember(i: number, value: string) {
    const next = [...memberEmails];
    next[i] = value;
    setMemberEmails(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const emails = memberEmails.map((n) => n.trim()).filter(Boolean);

    if (emails.length < 2) {
      setError("At least 2 members required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await authFetch("/api/projects/expense-tracker/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, memberEmails: emails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-up relative overflow-hidden rounded-xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900/60 to-zinc-950/40 p-5 backdrop-blur-sm"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />
      <h3 className="mb-4 text-sm font-semibold text-zinc-100">Create Group</h3>
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name (e.g. Room 301)"
            required
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wider text-zinc-500">
            Members by email{" "}
            <span className="normal-case text-zinc-600">
              (must be registered)
            </span>
          </label>
          <div className="flex flex-col gap-2">
            {memberEmails.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900/80 text-[10px] font-semibold text-zinc-500">
                  {i + 1}
                </span>
                <input
                  type="email"
                  value={m}
                  onChange={(e) => updateMember(i, e.target.value)}
                  placeholder={`Member ${i + 1} email`}
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
                {memberEmails.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeMemberField(i)}
                    className="text-xs text-zinc-600 transition-colors hover:text-red-400"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addMemberField}
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-500 transition-colors hover:text-brand-400"
          >
            + Add member
          </button>
        </div>

        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-zinc-800/80 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-brand-600 via-brand-500 to-fuchsia-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">
              {saving ? "Creating..." : "Create Group"}
            </span>
          </button>
        </div>
      </div>
    </form>
  );
}
