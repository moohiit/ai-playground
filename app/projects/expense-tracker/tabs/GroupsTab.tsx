"use client";

import { useEffect, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";
import { GroupDetail } from "../components/GroupDetail";

type Group = {
  _id: string;
  name: string;
  description: string;
  members: { userId: string; email: string; name: string; isActive: boolean }[];
};

export function GroupsTab() {
  const { authFetch } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function fetchGroups() {
    setLoading(true);
    const res = await authFetch("/api/projects/expense-tracker/groups");
    const data = await res.json();
    setGroups(data.groups ?? []);
    setLoading(false);
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
        <h2 className="text-lg font-semibold">Groups</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + New Group
        </button>
      </div>

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
        <p className="text-sm text-zinc-500">Loading...</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <p className="text-sm text-zinc-400">
            No groups yet. Create one to start splitting expenses.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <button
              key={g._id}
              onClick={() => setSelectedId(g._id)}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-left transition hover:border-brand-500"
            >
              <h3 className="font-semibold text-zinc-100">{g.name}</h3>
              {g.description && (
                <p className="text-xs text-zinc-500">{g.description}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {g.members.map((m) => (
                  <span
                    key={m.userId}
                    className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-400"
                  >
                    {m.name}
                  </span>
                ))}
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

  function updateMember(i: number, value: string) {
    const next = [...memberEmails];
    next[i] = value;
    setMemberEmails(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const emails = memberEmails
      .map((n) => n.trim())
      .filter(Boolean);

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
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5"
    >
      <h3 className="mb-4 text-sm font-semibold">Create Group</h3>
      <div className="flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name (e.g. Room 301)"
          required
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
        />

        <div>
          <label className="mb-1 block text-xs text-zinc-500">Add members by email (they must be registered)</label>
          <div className="flex flex-col gap-2">
            {memberEmails.map((m, i) => (
              <input
                key={i}
                type="email"
                value={m}
                onChange={(e) => updateMember(i, e.target.value)}
                placeholder={`Member ${i + 1} email`}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
              />
            ))}
          </div>
          <button
            type="button"
            onClick={addMemberField}
            className="mt-2 text-xs text-brand-500 hover:underline"
          >
            + Add member
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-400"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </form>
  );
}
