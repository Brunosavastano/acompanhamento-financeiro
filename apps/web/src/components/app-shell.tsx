import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import {
  BarChart3,
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Download,
  Flag,
  Settings,
  Table2,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/fechamento", label: "Fechamento mensal", icon: CalendarCheck },
  { href: "/balancetes", label: "Balancetes", icon: Table2 },
  { href: "/dividas", label: "Dívidas", icon: CreditCard },
  { href: "/orcamento", label: "Orçamento", icon: CircleDollarSign },
  { href: "/metas", label: "Metas", icon: Flag },
  { href: "/relatorios", label: "Relatórios", icon: ClipboardList },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-ink text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-line bg-panel/95 px-4 py-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <BrandLogo />
          <div>
            <div className="text-sm font-semibold text-white">Financeiro Familiar</div>
            <div className="text-xs text-slate-400">Família Savastano</div>
          </div>
        </Link>
        <nav className="mt-8 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="focus-ring flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-300 hover:bg-panel2 hover:text-white"
            >
              <item.icon className="h-4 w-4 text-slate-500" aria-hidden />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute inset-x-4 bottom-5 rounded-md border border-line bg-ink/60 p-3">
          <div className="text-sm font-medium text-white">{session.user.name}</div>
          <div className="truncate text-xs text-slate-400">{session.user.email}</div>
          <SignOutButton />
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-white">
              <BrandLogo size="sm" />
              Financeiro
            </Link>
            <SignOutButton compact />
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="whitespace-nowrap rounded-md border border-line px-3 py-1.5 text-xs text-slate-300">
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
