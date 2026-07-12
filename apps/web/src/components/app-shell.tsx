import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { asMonthStart, nextMonth } from "@/lib/date";
import { NavLinks, MobileNavLinks } from "@/components/nav-links";
import { SignOutButton } from "@/components/sign-out-button";

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

async function isClosePending(householdId?: string) {
  if (!householdId) return false;
  const latest = await prisma.monthlySnapshot.findFirst({
    where: { householdId, status: { in: ["closed", "revised"] } },
    orderBy: { periodMonth: "desc" },
    select: { periodMonth: true },
  });
  if (!latest) return true;
  return nextMonth(latest.periodMonth) <= asMonthStart(new Date());
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const closePending = await isClosePending(session.user.householdId);

  return (
    <div className="min-h-screen bg-night text-body">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[264px] flex-col border-r border-edge-soft bg-sidebar px-4 pb-5 pt-6 lg:flex">
        <Link href="/dashboard" className="focus-ring flex items-center gap-3 rounded-lg px-2">
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[10px] border border-gold/40 bg-gold/[0.08] p-[5px]">
            <Image src="/savastano-logo.png" alt="Savastano" width={96} height={126} className="h-full w-full object-contain" />
          </span>
          <span className="block">
            <span className="block font-display text-[17px] tracking-[0.04em] text-snow">Savastano</span>
            <span className="block text-[11px] uppercase tracking-[0.14em] text-faint">Financeiro familiar</span>
          </span>
        </Link>
        <NavLinks closePending={closePending} />
        <div className="flex items-center gap-2.5 border-t border-edge-soft px-2 pt-4">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-edge bg-elevated text-xs font-semibold text-gold">
            {initials(session.user.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-snow">{session.user.name}</span>
            <span className="block truncate text-[11px] text-faint">{session.user.email}</span>
          </span>
          <SignOutButton icon />
        </div>
      </aside>
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-edge-soft bg-night/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/dashboard" className="flex items-center gap-2.5 text-sm font-semibold text-snow">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/40 bg-gold/[0.08] p-1">
                <Image src="/savastano-logo.png" alt="Savastano" width={96} height={126} className="h-full w-full object-contain" />
              </span>
              <span className="font-display font-normal tracking-[0.04em]">Savastano</span>
            </Link>
            <SignOutButton compact />
          </div>
          <MobileNavLinks />
        </header>
        {children}
      </div>
    </div>
  );
}
