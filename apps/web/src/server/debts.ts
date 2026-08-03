import type { DebtCashflow, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export type DeclaredDebtInput = {
  householdId: string;
  userId: string | null;
  personId: string;
  cardName: string;
  invoiceMonth: Date;
  paymentMonth: Date;
  amount: number;
  description?: string | null;
  mode: "replace" | "add";
};

export type DeclaredDebtResult = {
  created: DebtCashflow;
  replaced: DebtCashflow[];
};

/**
 * Bases de meses já FECHADOS são imutáveis (mesmo invariante das posições):
 * escrever nelas reescreveria retroativamente o PV e o patrimônio do mês no
 * histórico. Se a última revisão do mês for um rascunho (revisão em andamento)
 * ou não houver snapshot, a base está aberta para edição.
 */
export async function assertDebtBaseEditable(householdId: string, invoiceMonth: Date) {
  const latest = await prisma.monthlySnapshot.findFirst({
    where: { householdId, periodMonth: invoiceMonth },
    orderBy: { revisionNumber: "desc" },
    select: { status: true },
  });
  if (latest && latest.status !== "draft") {
    throw new Response(
      JSON.stringify({
        error: "Este mês-base já foi fechado. Lance na base do mês em aberto, ou crie uma revisão do fechamento para ajustá-lo.",
      }),
      { status: 409, headers: { "content-type": "application/json" } },
    );
  }
}

/**
 * Grava um valor declarado de fatura/parcela, auditando NA MESMA transação.
 *
 * Em `replace` (padrão), o valor SUBSTITUI o que já estava declarado para a
 * mesma chave (pessoa, cartão, mês-base, vencimento) — os lançamentos antigos
 * são removidos e preservados no AuditLog (action "replace"), atomicamente com
 * a deleção. Em `add`, soma como parcela avulsa com source "purchase", que as
 * métricas tratam como aditiva (nunca evicta declarações de outras bases).
 */
export async function upsertDeclaredDebt(tx: PrismaLike, input: DeclaredDebtInput): Promise<DeclaredDebtResult> {
  const replaced =
    input.mode === "replace"
      ? await tx.debtCashflow.findMany({
          where: {
            householdId: input.householdId,
            personId: input.personId,
            cardName: input.cardName,
            invoiceMonth: input.invoiceMonth,
            paymentMonth: input.paymentMonth,
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

  if (replaced.length) {
    await tx.debtCashflow.deleteMany({ where: { id: { in: replaced.map((flow) => flow.id) } } });
  }

  const created = await tx.debtCashflow.create({
    data: {
      householdId: input.householdId,
      personId: input.personId,
      cardName: input.cardName,
      invoiceMonth: input.invoiceMonth,
      paymentMonth: input.paymentMonth,
      amount: input.amount,
      description: input.description ?? null,
      source: input.mode === "add" ? "purchase" : replaced.length ? "adjustment" : "manual_matrix",
    },
  });

  // Auditoria dentro da transação: o AuditLog é a única cópia dos valores
  // substituídos, então commit sem auditoria não pode acontecer.
  await audit(
    {
      userId: input.userId,
      entityType: "debt_cashflow",
      entityId: created.id,
      action: replaced.length ? "replace" : "create",
      oldValue: replaced.length ? replaced : undefined,
      newValue: created,
      reason: replaced.length ? "Substituição do valor declarado para o mês de vencimento." : null,
    },
    tx,
  );

  return { created, replaced };
}
