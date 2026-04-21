"use client";

import { useState } from "react";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="h-10 px-4 rounded-xl bg-white border border-black/[0.1] text-[13.5px] font-medium text-muted-foreground hover:text-foreground hover:bg-black/[0.02] transition-colors disabled:opacity-50"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
