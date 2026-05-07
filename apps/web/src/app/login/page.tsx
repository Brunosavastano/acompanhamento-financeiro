import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative min-h-screen overflow-hidden bg-ink text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(43,211,242,0.11),transparent_34%),linear-gradient(180deg,rgba(11,18,32,0.88),rgba(5,9,20,1))]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-6 py-10">
        <section className="flex w-full flex-col items-center text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-300 sm:text-sm">Acompanhamento Financeiro</p>
          <div className="mt-7 w-full max-w-[240px] overflow-hidden rounded-lg border border-line/80 bg-panel2/35 shadow-glow sm:max-w-[280px]">
            <Image
              src="/savastano-crest.png"
              alt="Brasão Savastano"
              width={700}
              height={875}
              priority
              className="h-auto w-full object-contain"
            />
          </div>
          <div className="mt-8 w-full max-w-sm">
          <LoginForm />
          </div>
          <div className="mt-8 h-px w-24 bg-gradient-to-r from-transparent via-cyan/70 to-transparent" />
        </section>
      </div>
    </main>
  );
}
