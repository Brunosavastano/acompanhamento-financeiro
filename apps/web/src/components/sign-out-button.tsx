"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={`focus-ring mt-3 inline-flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-magenta hover:text-white ${
        compact ? "mt-0" : ""
      }`}
    >
      <LogOut className="h-3.5 w-3.5" aria-hidden />
      {compact ? "Sair" : "Encerrar sessao"}
    </button>
  );
}
