"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../../lib/utils";
import type { KnownPerson } from "../types";

type Member = {
  userId: string;
  email: string;
  name: string;
  isActive: boolean;
  isGuest?: boolean;
};

type DeleteRequest = { userId: string; name: string; requestedAt: string };

type Props = {
  onClose: () => void;
  viewerId?: string;
  creatorId: string;

  // Group name
  groupName: string;
  /** Resolves true once the server accepted the new name. */
  onRename: (name: string) => Promise<boolean>;

  // Members
  members: Member[];
  onRemoveMember: (m: Member) => void;
  removingId: string | null;
  suggestions: KnownPerson[];
  suggestionsOpen: boolean;
  setSuggestionsOpen: (v: boolean) => void;
  newMember: string;
  setNewMember: (v: string) => void;
  onAddMember: () => void;
  addingMember: boolean;
  newGuest: string;
  setNewGuest: (v: string) => void;
  onAddGuest: () => void;
  addingGuest: boolean;

  // Notifications
  muted: boolean;
  muteBusy: boolean;
  onToggleMute: () => void;

  // Share link
  shareId: string | null;
  shareUrl: string;
  shareBusy: boolean;
  onToggleShare: () => void;
  onCopyShare: () => void;
  copied: boolean;

  // Danger zone
  deleteRequests: DeleteRequest[];
  deleteRequestBusy: boolean;
  onDeleteGroup: () => void;
  onRequestDelete: () => void;
  /** Member: withdraws their own request. Creator: dismisses all of them. */
  onClearDeleteRequests: () => void;
};

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function GroupSettingsModal(props: Props) {
  const {
    onClose,
    viewerId,
    creatorId,
    groupName,
    onRename,
    members,
    onRemoveMember,
    removingId,
    suggestions,
    suggestionsOpen,
    setSuggestionsOpen,
    newMember,
    setNewMember,
    onAddMember,
    addingMember,
    newGuest,
    setNewGuest,
    onAddGuest,
    addingGuest,
    muted,
    muteBusy,
    onToggleMute,
    shareId,
    shareUrl,
    shareBusy,
    onToggleShare,
    onCopyShare,
    copied,
    deleteRequests,
    deleteRequestBusy,
    onDeleteGroup,
    onRequestDelete,
    onClearDeleteRequests,
  } = props;

  const canManage = !!viewerId && viewerId === creatorId;
  const creatorName =
    members.find((m) => m.userId === creatorId)?.name ?? "the creator";
  const myRequest = deleteRequests.find((r) => r.userId === viewerId);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(groupName);
  const [savingName, setSavingName] = useState(false);

  async function saveName() {
    if (savingName) return;
    const next = nameDraft.trim();
    if (!next || next === groupName) {
      setRenaming(false);
      return;
    }
    setSavingName(true);
    const ok = await onRename(next);
    setSavingName(false);
    if (ok) setRenaming(false);
  }

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // An in-app alert/confirm raised from here sits on top and owns Escape;
      // closing the settings underneath it would be a surprise.
      if (document.getElementById("app-dialog-message")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="group-settings-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl shadow-brand-500/10"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />

        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950/95 px-6 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-[0.18em] text-brand-500/90">
              {groupName}
            </div>
            <h2 id="group-settings-title" className="text-lg font-semibold text-zinc-100">
              Group settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex max-h-[calc(100vh-10rem)] flex-col gap-6 overflow-y-auto px-6 py-5">
          {/* a. Group name */}
          <section className="flex flex-col gap-2">
            <SectionLabel>Group name</SectionLabel>
            {renaming ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      // Cancel the edit, not the whole modal.
                      e.stopPropagation();
                      setRenaming(false);
                    }
                  }}
                  aria-label="Group name"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={saveName}
                  disabled={savingName || !nameDraft.trim()}
                  className="rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-500 transition-colors hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingName ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  disabled={savingName}
                  className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-words text-sm text-zinc-100">{groupName}</span>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(groupName);
                      setRenaming(true);
                    }}
                    className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900/40 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-500"
                  >
                    Rename
                  </button>
                ) : (
                  <span className="shrink-0 text-[11px] text-zinc-600">
                    Only {creatorName} can rename
                  </span>
                )}
              </div>
            )}
          </section>

          {/* b. Members */}
          <section className="flex flex-col gap-2">
            <SectionLabel>Members ({members.filter((m) => m.isActive).length})</SectionLabel>
            <div className="overflow-hidden rounded-lg border border-zinc-800">
              {members.map((m, i) => (
                <div
                  key={m.userId}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2",
                    i > 0 && "border-t border-zinc-800/60",
                    !m.isActive && "opacity-60"
                  )}
                >
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-fuchsia-500/20 text-[10px] font-semibold text-zinc-200">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm text-zinc-200">
                      {m.name}
                      {m.userId === viewerId && (
                        <span className="ml-1 text-[11px] text-zinc-500">(you)</span>
                      )}
                    </span>
                    {!m.isGuest && m.email && (
                      <span className="block truncate text-[10px] text-zinc-500">{m.email}</span>
                    )}
                  </span>
                  {m.userId === creatorId && (
                    <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-brand-300">
                      creator
                    </span>
                  )}
                  {m.isGuest && (
                    <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">
                      guest
                    </span>
                  )}
                  {!m.isActive && (
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-400">
                      left
                    </span>
                  )}
                  {canManage && m.isActive && m.userId !== creatorId && (
                    <button
                      type="button"
                      onClick={() => onRemoveMember(m)}
                      disabled={removingId !== null}
                      title={`Remove ${m.name} (their expenses stay)`}
                      aria-label={`Remove ${m.name}`}
                      className="ml-0.5 shrink-0 rounded p-0.5 text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-40"
                    >
                      {removingId === m.userId ? "…" : "✕"}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="email"
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                placeholder="Invite member by email"
                className={inputClass}
                onFocus={() => setSuggestionsOpen(true)}
                // Delayed so a click on a suggestion registers before the list
                // unmounts — otherwise blur removes it mid-click.
                onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onAddMember();
                  if (e.key === "Escape" && suggestionsOpen && suggestions.length > 0) {
                    // First Escape dismisses the list; the next closes the modal.
                    e.stopPropagation();
                    setSuggestionsOpen(false);
                  }
                }}
              />
              <button
                type="button"
                onClick={onAddMember}
                disabled={addingMember || !newMember.trim()}
                className="rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-500 transition-all hover:-translate-y-0.5 hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {addingMember ? "Inviting..." : "Invite"}
              </button>
            </div>
            {/* Suggestions narrow as you type, so the field still accepts an
                address nobody in your groups has. */}
            {suggestionsOpen && suggestions.length > 0 && (
              <div className="-mt-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/90">
                {suggestions.map((p, i) => (
                  <button
                    key={p.userId}
                    type="button"
                    onClick={() => {
                      setNewMember(p.email);
                      setSuggestionsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-brand-500/10",
                      i > 0 && "border-t border-zinc-800/60"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs text-zinc-200">{p.name}</span>
                      <span className="block truncate text-[10px] text-zinc-500">
                        {p.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-600">
                      {p.sharedGroups} shared
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newGuest}
                onChange={(e) => setNewGuest(e.target.value)}
                placeholder="Add a guest by name (no account)"
                className={inputClass}
                onKeyDown={(e) => e.key === "Enter" && onAddGuest()}
              />
              <button
                type="button"
                onClick={onAddGuest}
                disabled={addingGuest || !newGuest.trim()}
                className="rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-all hover:-translate-y-0.5 hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {addingGuest ? "Adding..." : "Add guest"}
              </button>
            </div>
          </section>

          {/* c. Notifications */}
          <section className="flex flex-col gap-2">
            <SectionLabel>Notifications</SectionLabel>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2.5">
              <div className="min-w-0">
                <div id="group-mute-label" className="text-sm text-zinc-200">
                  Mute this group
                </div>
                <div className="text-[11px] text-zinc-500">
                  {muted
                    ? "You won't be notified about activity in this group."
                    : "You're notified about new expenses, edits and settlements."}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={muted}
                aria-labelledby="group-mute-label"
                onClick={onToggleMute}
                disabled={muteBusy}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  muted
                    ? "border-brand-500/60 bg-brand-500/40"
                    : "border-zinc-700 bg-zinc-800"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
                    muted ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </section>

          {/* d. Share link */}
          <section className="flex flex-col gap-2">
            <SectionLabel>Share link</SectionLabel>
            {shareId ? (
              <div className="rounded-xl border border-brand-500/30 bg-brand-500/[0.06] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-zinc-100">
                    🔗 Public split link
                  </div>
                  <button
                    type="button"
                    onClick={onToggleShare}
                    disabled={shareBusy}
                    className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    {shareBusy ? "Turning off..." : "Turn off"}
                  </button>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Anyone with this link sees a read-only "who owes whom" — no login, no amounts editable.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.target.select()}
                    aria-label="Public split link"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300"
                  />
                  <button
                    type="button"
                    onClick={onCopyShare}
                    className="shrink-0 rounded-lg bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-xs font-semibold text-white"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2.5">
                <p className="min-w-0 text-[11px] text-zinc-500">
                  Create a public, read-only "who owes whom" link — no login needed to view it.
                </p>
                <button
                  type="button"
                  onClick={onToggleShare}
                  disabled={shareBusy}
                  className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-900/40 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shareBusy ? "Creating..." : "Share"}
                </button>
              </div>
            )}
          </section>

          {/* e. Danger zone */}
          <section className="flex flex-col gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-red-400/90">
              Danger zone
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/[0.04] p-3">
              {canManage ? (
                <>
                  {deleteRequests.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      <span className="min-w-0 text-xs text-amber-300">
                        {joinNames(deleteRequests.map((r) => r.name))} asked you to
                        delete this group
                      </span>
                      <button
                        type="button"
                        onClick={onClearDeleteRequests}
                        disabled={deleteRequestBusy}
                        className="shrink-0 text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline disabled:opacity-50"
                      >
                        {deleteRequestBusy ? "Dismissing..." : "Dismiss requests"}
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="min-w-0 text-[11px] text-zinc-500">
                      Deletes the group and all its expenses. This cannot be undone.
                    </p>
                    <button
                      type="button"
                      onClick={onDeleteGroup}
                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10"
                    >
                      Delete group
                    </button>
                  </div>
                </>
              ) : myRequest ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm text-zinc-500">Deletion requested</span>
                  <button
                    type="button"
                    onClick={onClearDeleteRequests}
                    disabled={deleteRequestBusy}
                    className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline disabled:opacity-50"
                  >
                    {deleteRequestBusy ? "Withdrawing..." : "Withdraw"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-zinc-500">
                    Only {creatorName} can delete this group. You can ask them to.
                  </p>
                  <button
                    type="button"
                    onClick={onRequestDelete}
                    disabled={deleteRequestBusy}
                    className="w-fit max-w-full rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-left text-sm text-red-400 transition-colors hover:border-red-500/60 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleteRequestBusy
                      ? "Sending..."
                      : `Ask ${creatorName} to delete this group`}
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

const inputClass =
  "min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </div>
  );
}
