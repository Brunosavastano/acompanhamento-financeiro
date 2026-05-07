import { personSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = personSchema.parse(await request.json());
    const current = await prisma.person.findFirstOrThrow({
      where: { id, householdId },
      select: {
        id: true,
        name: true,
        role: true,
        accounts: {
          select: { id: true, personId: true, name: true, accountType: true, isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
    const updated = await prisma.person.update({
      where: { id },
      data: {
        name: input.name,
        role: input.role,
      },
      select: {
        id: true,
        name: true,
        role: true,
        accounts: {
          select: { id: true, personId: true, name: true, accountType: true, isActive: true },
          orderBy: { name: "asc" },
        },
      },
    });
    await audit({ userId, entityType: "person", entityId: id, action: "update", oldValue: current, newValue: updated });
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
    const current = await prisma.person.findFirstOrThrow({
      where: { id, householdId },
      include: { accounts: true },
    });
    const [positions, debtCashflows, budgetItems, accountPositions] = await Promise.all([
      prisma.position.count({ where: { personId: id } }),
      prisma.debtCashflow.count({ where: { personId: id } }),
      prisma.budgetItem.count({ where: { personId: id } }),
      prisma.position.count({ where: { accountId: { in: current.accounts.map((account) => account.id) } } }),
    ]);
    if (positions + debtCashflows + budgetItems + accountPositions > 0) {
      return json({ error: "Pessoa possui movimentos vinculados e não pode ser removida." }, { status: 409 });
    }
    await prisma.person.delete({ where: { id } });
    await audit({ userId, entityType: "person", entityId: id, action: "delete", oldValue: current });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
