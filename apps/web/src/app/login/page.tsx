import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen bg-ink text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-12">
          <div className="flex items-center gap-3">
            <BrandLogo size="lg" />
            <span className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-300">Acompanhamento Financeiro</span>
          </div>
          <div className="flex flex-1 flex-col justify-center py-8">
            <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-lg border border-line bg-panel2/40 shadow-glow sm:max-w-[340px]">
              <Image
                src="/savastano-crest.png"
                alt="Brasao Savastano"
                width={700}
                height={875}
                priority
                className="h-auto w-full object-contain"
              />
            </div>
          </div>
          <div className="max-w-xl pb-8">
            <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
              Fechamento financeiro familiar, sem copiar celulas.
            </h1>
            <p className="mt-5 text-base leading-7 text-slate-300">
              Dashboard, dividas a valor presente, orcamento, metas e historico mensal em uma rotina unica de fechamento.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-slate-400 sm:grid-cols-3">
            <span>PL consolidado</span>
            <span>Selic manual</span>
            <span>Backup exportavel</span>
          </div>
        </section>
        <section className="flex items-center justify-center border-l border-line bg-panel px-6 py-12">
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
