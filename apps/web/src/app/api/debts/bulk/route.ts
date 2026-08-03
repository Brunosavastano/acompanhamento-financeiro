import { debtBulkSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { assertDebtBaseEditable, upsertDeclaredDebt, type DeclaredDebtResult } from "@/server/debts";
import { assertPersonInHousehold } from "@/server/guards";

/**
 * Grava vários meses de fatura de uma vez (grade manual ou leitura de print).
 * Tudo em uma transação — inclusive a auditoria, que preserva os valores
 * substituídos; a semântica padrão é substituir o valor já declarado de cada mês.
 */
export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const input = debtBulkSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    await assertDebtBaseEditable(householdId, asMonthStart(input.invoiceMonth));

    const results = await prisma.$transaction(async (tx) => {
      const collected: DeclaredDebtResult[] = [];
      for (const entry of input.entries) {
        collected.push(
          await upsertDeclaredDebt(tx, {
            householdId,
            userId,
            personId: input.personId,
            cardName: input.cardName,
            invoiceMonth: asMonthStart(input.invoiceMonth),
            paymentMonth: asMonthStart(entry.paymentMonth),
            amount: entry.amount,
            description: entry.description,
            mode: input.mode,
          }),
        );
      }
      return collected;
    });

    return json(
      {
        flows: results.map((result) => result.created),
        createdCount: results.filter((result) => result.replaced.length === 0).length,
        replacedCount: results.filter((result) => result.replaced.length > 0).length,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
