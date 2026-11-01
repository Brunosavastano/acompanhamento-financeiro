import type { SnapshotStatus } from "@prisma/client";
import {
  calculateDebtEvolution,
  calculateDebtMetrics,
  calculateDebtOutlook,
  toMoneyNumber,
  type DebtCashflowInput,
} from "@finance/financial-calculations";
import { prisma } from "@/lib/prisma";
import { formatPeriod } from "@/lib/date";
import { toDecimalNumber } from "@/lib/format";
import type { EvolutionAccount, EvolutionData } from "@/lib/evolution";

const closedStatuses: SnapshotStatus[] = ["closed", "revised"];

const categoryNames: Record<EvolutionAccount["category"], string> = {
  cash: "Caixa",
  benefit: "VR/VA",
  investment: "Investimentos",
  cashback: "Cashback",
};

/**
 * Saldos de cada conta, dívida por pessoa e evolução das dívidas em todos os
 * meses fechados até `periodMonth` — a base da visão geral por pessoa/conta.
 * Usa a última revisão de cada mês, como o histórico do dashboard.
 */
export async function getEvolutionData(householdId: string, periodMonth: Date): Promise<EvolutionData> {
  const [snapshots, people, flows] = await Promise.all([
    prisma.monthlySnapshot.findMany({
      where: { householdId, status: { in: closedStatuses }, periodMonth: { lte: periodMonth } },
      orderBy: [{ periodMonth: "asc" }, { revisionNumber: "desc" }],
      include: { positions: { include: { account: true } } },
    }),
    prisma.person.findMany({ where: { householdId }, orderBy: { name: "asc" } }),
    prisma.debtCashflow.findMany({
      where: { householdId },
      select: { personId: true, cardName: true, invoiceMonth: true, paymentMonth: true, amount: true, source: true },
    }),
  ]);

  const latestByMonth = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const key = formatPeriod(snapshot.periodMonth);
    if (!latestByMonth.has(key)) latestByMonth.set(key, snapshot);
  }

  const debtFlows: DebtCashflowInput[] = flows.map((flow) => ({ ...flow, amount: toDecimalNumber(flow.amount) }));
  const flowsByBase = new Map<string, DebtCashflowInput[]>();
  for (const flow of debtFlows) {
    const base = formatPeriod(flow.invoiceMonth);
    flowsByBase.set(base, [...(flowsByBase.get(base) ?? []), flow]);
  }

  const accounts = new Map<string, EvolutionAccount>();
  const months = [...latestByMonth.entries()].map(([month, snapshot]) => {
    const balances: Record<string, number> = {};
    for (const position of snapshot.positions) {
      const key = position.accountId ?? `${position.personId}:${position.category}`;
      if (!accounts.has(key)) {
        accounts.set(key, {
          key,
          personId: position.personId,
          name: position.account?.name ?? categoryNames[position.category],
          category: position.category,
          group: position.category === "cash" || position.category === "benefit" ? "cash" : "investments",
        });
      }
      balances[key] = (balances[key] ?? 0) + toDecimalNumber(position.amount);
    }
    for (const key of Object.keys(balances)) balances[key] = Math.round(balances[key] * 100) / 100;

    // Mesma conta do patrimônio: declaração da própria base, a valor presente com a Selic do fechamento.
    const debt = calculateDebtMetrics(flowsByBase.get(month) ?? [], toDecimalNumber(snapshot.selicAnnual), month);
    const debtPv = Object.fromEntries(Object.entries(debt.byPerson).map(([personId, value]) => [personId, toMoneyNumber(value.presentValueTotal)]));
    return { month: month.slice(0, 7), balances, debtPv, debtPvTotal: toMoneyNumber(debt.presentValueTotal) };
  });

  const personOrder = new Map(people.map((person, index) => [person.id, index]));
  const sortedAccounts = [...accounts.values()].sort(
    (a, b) =>
      (personOrder.get(a.personId) ?? 99) - (personOrder.get(b.personId) ?? 99) ||
      Number(a.group === "investments") - Number(b.group === "investments") ||
      a.name.localeCompare(b.name, "pt-BR"),
  );

  const evolution = calculateDebtEvolution(debtFlows, [...latestByMonth.keys()]);
  const outlook = calculateDebtOutlook(debtFlows, periodMonth);
  const money = (value: { toNumber(): number } | null) => (value === null ? null : Math.round(value.toNumber() * 100) / 100);

  return {
    people: people.map((person) => ({ id: person.id, name: person.name })),
    accounts: sortedAccounts,
    months,
    debt: {
      months: evolution.map((row) => ({
        month: row.month.slice(0, 7),
        byPerson: Object.fromEntries(
          Object.entries(row.byPerson).map(([personId, value]) => [
            personId,
            {
              outstanding: money(value.outstanding),
              invoice: money(value.invoice),
              invoiceProjected: value.invoiceProjected,
              averageInvoice: money(value.averageInvoice),
              paidSincePrevious: money(value.paidSincePrevious),
              newSincePrevious: money(value.newSincePrevious),
            },
          ]),
        ),
      })),
      outlook: {
        asOfMonth: outlook.asOfMonth.slice(0, 7),
        byPerson: Object.fromEntries(
          Object.entries(outlook.byPerson).map(([personId, value]) => [
            personId,
            {
              baseMonth: value.baseMonth.slice(0, 7),
              schedule: value.schedule.map((item) => ({ month: item.month.slice(0, 7), amount: Math.round(item.amount.toNumber() * 100) / 100 })),
            },
          ]),
        ),
      },
    },
  };
}
