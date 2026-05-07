"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function WelcomeTransition({ displayName, greeting }: { displayName: string; greeting: "Bem-vindo" | "Bem-vinda" }) {
  const router = useRouter();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      router.replace("/dashboard");
    }, 2300);
    return () => window.clearTimeout(timeout);
  }, [router]);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-ink px-6 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(43,211,242,0.16),transparent_28%),radial-gradient(circle_at_50%_62%,rgba(88,246,148,0.09),transparent_26%),linear-gradient(180deg,#050914_0%,#07101f_48%,#050914_100%)]" />
      <section className="welcome-in relative flex w-full max-w-xl flex-col items-center text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-400">Acompanhamento Financeiro</p>
        <div className="mt-8 grid h-28 w-28 place-items-center rounded-full border border-line bg-panel/70 shadow-glow">
          <Image src="/savastano-logo.png" alt="Savastano" width={110} height={144} priority className="h-20 w-20 object-contain" />
        </div>
        <div className="mt-8 h-px w-32 bg-gradient-to-r from-transparent via-cyan/70 to-transparent" />
        <h1 className="mt-8 text-balance text-3xl font-semibold tracking-[-0.01em] text-white sm:text-5xl">
          {greeting}, {displayName}
        </h1>
        <p className="mt-4 text-sm text-slate-400">Preparando seu painel financeiro.</p>
        <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-panel2">
          <div className="welcome-progress h-full rounded-full bg-cyan" />
        </div>
        <Link href="/dashboard" className="focus-ring mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-200">
          Ir para o dashboard
        </Link>
      </section>
    </main>
  );
}
