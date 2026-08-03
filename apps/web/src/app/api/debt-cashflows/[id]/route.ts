import { debtCashflowSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertDebtBaseEditable } from "@/server/debts";
import { assertPersonInHousehold } from "@/server/guards";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = debtCashflowSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    const current = await prisma.debtCashflow.findFirstOrThrow({ where: { id, householdId } });
    await assertDebtBaseEditable(householdId, current.invoiceMonth);
    await assertDebtBaseEditable(householdId, asMonthStart(input.invoiceMonth));
    const updated = await prisma.debtCashflow.update({
      where: { id },
      data: {
        personId: input.personId,
        cardName: input.cardName,
        invoiceMonth: asMonthStart(input.invoiceMonth),
        paymentMonth: asMonthStart(input.paymentMonth),
        amount: input.amount,
        description: input.description,
        source: "adjustment",
      },
    });
    await audit({ userId, entityType: "debt_cashflow", entityId: id, action: "update", oldValue: current, newValue: updated });
    return json(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const current = await prisma.debtCashflow.findFirstOrThrow({ where: { id, householdId } });
    await assertDebtBaseEditable(householdId, current.invoiceMonth);
    await prisma.debtCashflow.delete({ where: { id } });
    await audit({ userId, entityType: "debt_cashflow", entityId: id, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
