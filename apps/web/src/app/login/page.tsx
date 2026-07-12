import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";

function Wordmark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] border border-gold/40 bg-gold/[0.08] p-[5px]">
        <Image src="/savastano-logo.png" alt="Savastano" width={34} height={34} className="h-full w-full object-contain" />
      </span>
      <span>
        <span className="block font-display text-lg tracking-[0.04em] text-snow">Savastano</span>
        <span className="block text-[11px] uppercase tracking-[0.14em] text-faint">Financeiro familiar</span>
      </span>
    </div>
  );
}

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="grid min-h-screen bg-night text-body lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-edge-soft bg-[linear-gradient(165deg,#0C1428_0%,#070C18_70%)] px-14 py-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(201,169,110,0.08),transparent_45%)]" />
        <div className="relative">
          <Wordmark />
        </div>
        <div className="relative flex justify-center py-6">
          <Image
            src="/savastano-crest.png"
            alt="Brasão da família Savastano"
            width={700}
            height={875}
            priority
            className="h-auto w-full max-w-[340px] rounded-xl border border-gold/25 object-contain shadow-glow"
          />
        </div>
        <div className="relative">
          <p className="max-w-[420px] font-display text-xl leading-[30px] text-snow">Veritas, Libertas, Honor.</p>
          <p className="mt-2 max-w-[420px] text-[13px] leading-5 text-muted">
            O fechamento mensal, o patrimônio e as metas da família — em um lugar só, com a precisão da planilha.
          </p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 flex justify-center lg:hidden">
            <Wordmark />
          </div>
          <h1 className="font-display text-[28px] font-normal text-snow">Bem-vindo de volta</h1>
          <p className="mt-2.5 text-[13px] leading-5 text-muted">Entre para continuar o acompanhamento da família.</p>
          <LoginForm />
          <p className="mt-6 text-center text-[11px] leading-[17px] text-faint">
            Acesso privado da família · dados protegidos por login
          </p>
        </div>
      </section>
    </main>
  );
}
