"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  BarChart3,
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Flag,
  History,
  Settings,
  type LucideIcon,
} from "lucide-react";

type NavItem = { href: string; label: string; icon: LucideIcon; pendingDot?: boolean };
type NavGroup = { label: string; items: NavItem[] };

function navGroups(closePending: boolean): NavGroup[] {
  return [
    {
      label: "Visão",
      items: [
        { href: "/dashboard", label: "Visão geral", icon: BarChart3 },
        { href: "/fechamento", label: "Fechar o mês", icon: CalendarCheck, pendingDot: closePending },
      ],
    },
    {
      label: "Patrimônio",
      items: [
        { href: "/balancetes", label: "Histórico mensal", icon: History },
        { href: "/metas", label: "Metas", icon: Flag },
      ],
    },
    {
      label: "Planejamento",
      items: [
        { href: "/orcamento", label: "Orçamento", icon: CircleDollarSign },
        { href: "/dividas", label: "Cartão e dívidas", icon: CreditCard },
      ],
    },
    {
      label: "Sistema",
      items: [
        { href: "/relatorios", label: "Dados e relatórios", icon: ClipboardList },
        { href: "/configuracoes", label: "Configurações", icon: Settings },
      ],
    },
  ];
}

export function NavLinks({ closePending = false }: { closePending?: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="mt-7 flex flex-1 flex-col gap-5">
      {navGroups(closePending).map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <span className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
            {group.label}
          </span>
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "focus-ring flex items-center gap-3 rounded-lg border-l-2 px-3 py-[9px] text-sm",
                  active
                    ? "border-gold bg-elevated font-semibold text-snow"
                    : "border-transparent font-medium text-muted hover:bg-[#101A2E] hover:text-snow",
                )}
              >
                <item.icon
                  className={clsx("h-[17px] w-[17px] shrink-0", active ? "text-gold" : "opacity-75")}
                  strokeWidth={2}
                  aria-hidden
                />
                {item.label}
                {item.pendingDot ? (
                  <span
                    className="ml-auto h-[7px] w-[7px] rounded-full bg-gold"
                    title="Mês pendente de fechamento"
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function MobileNavLinks() {
  const pathname = usePathname();
  const items = navGroups(false).flatMap((group) => group.items);

  return (
    <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs",
              active ? "border-gold/50 bg-elevated text-snow" : "border-edge text-muted",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
