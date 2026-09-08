"use client";

import { useEffect, useRef, useState } from "react";

/**
 * In-app replacement for window.alert and window.confirm.
 *
 * The browser dialogs are unstyled, block the tab, and look nothing like the
 * app. showAlert(message) and confirmDialog(message) draw the same thing in
 * the app's own style through <DialogHost />, mounted once at the root.
 * confirmDialog resolves true or false, so a call site reads
 * `if (!(await confirmDialog("Delete?"))) return;`.
 */
type Spec =
  | { id: number; kind: "alert"; title?: string; message: string; resolve: () => void }
  | {
      id: number;
      kind: "confirm";
      title?: string;
      message: string;
      confirmText: string;
      cancelText: string;
      destructive: boolean;
      resolve: (ok: boolean) => void;
    };

type Listener = (queue: Spec[]) => void;

let queue: Spec[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(queue);
}

function push(spec: Spec) {
  queue = [...queue, spec];
  emit();
}

function remove(id: number) {
  queue = queue.filter((d) => d.id !== id);
  emit();
}

export function showAlert(message: string, title?: string): Promise<void> {
  return new Promise((resolve) => {
    push({ id: ++seq, kind: "alert", title, message, resolve });
  });
}

export function confirmDialog(
  message: string,
  opts: {
    title?: string;
    confirmText?: string;
    cancelText?: string;
    /** Red primary button, for deletes and other one-way actions. */
    destructive?: boolean;
  } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    push({
      id: ++seq,
      kind: "confirm",
      title: opts.title,
      message,
      confirmText: opts.confirmText ?? "OK",
      cancelText: opts.cancelText ?? "Cancel",
      destructive: opts.destructive ?? false,
      resolve,
    });
  });
}

export function DialogHost() {
  const [items, setItems] = useState<Spec[]>([]);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const current = items[0];

  useEffect(() => {
    listeners.add(setItems);
    setItems(queue);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  // Enter confirms, Escape cancels — what the browser dialogs did.
  useEffect(() => {
    if (!current) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // settle closes over `current`; re-bind when the dialog changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;

  function settle(ok: boolean) {
    if (!current) return;
    remove(current.id);
    if (current.kind === "alert") current.resolve();
    else current.resolve(ok);
  }

  const isConfirm = current.kind === "confirm";

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) settle(false);
      }}
    >
      <div
        role={isConfirm ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={current.title ? "app-dialog-title" : undefined}
        aria-describedby="app-dialog-message"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-5 shadow-2xl"
      >
        {current.title && (
          <h2 id="app-dialog-title" className="text-base font-semibold text-zinc-100">
            {current.title}
          </h2>
        )}
        <p
          id="app-dialog-message"
          className={`whitespace-pre-line text-sm leading-6 text-zinc-300 ${current.title ? "mt-2" : ""}`}
        >
          {current.message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          {isConfirm && (
            <button
              type="button"
              onClick={() => settle(false)}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
            >
              {current.cancelText}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={() => settle(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
              isConfirm && current.destructive
                ? "bg-red-600 hover:bg-red-500"
                : "bg-brand-600 hover:bg-brand-500"
            }`}
          >
            {isConfirm ? current.confirmText : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
