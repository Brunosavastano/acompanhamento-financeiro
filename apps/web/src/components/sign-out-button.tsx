"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton({ compact = false, icon = false }: { compact?: boolean; icon?: boolean }) {
  if (icon) {
    return (
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        aria-label="Sair"
        title="Sair"
        className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-elevated hover:text-negative-text"
      >
        <LogOut className="h-[15px] w-[15px]" aria-hidden />
      </button>
    );
  }

  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`focus-ring mt-3 inline-flex items-center gap-2 rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-muted hover:border-negative hover:text-snow ${
        compact ? "mt-0" : ""
      }`}
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      {compact ? "Sair" : "Encerrar sessão"}
    </button>
  );
}
