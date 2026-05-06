import { debtCashflowSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertPersonInHousehold } from "@/server/guards";

export async function GET(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period_month");
    const cashflows = await prisma.debtCashflow.findMany({
      where: {
        householdId,
        ...(period ? { invoiceMonth: asMonthStart(period) } : {}),
      },
      include: { person: true },
      orderBy: [{ invoiceMonth: "desc" }, { paymentMonth: "asc" }],
    });
    return json(cashflows);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const input = debtCashflowSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    const flow = await prisma.debtCashflow.create({
      data: {
        householdId,
        personId: input.personId,
        cardName: input.cardName,
        invoiceMonth: asMonthStart(input.invoiceMonth),
        paymentMonth: asMonthStart(input.paymentMonth),
        amount: input.amount,
        description: input.description,
        source: "manual_matrix",
      },
    });
    await audit({ userId, entityType: "debt_cashflow", entityId: flow.id, action: "create", newValue: flow });
    return json(flow, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
