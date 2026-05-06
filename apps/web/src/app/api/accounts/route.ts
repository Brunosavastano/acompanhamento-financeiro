import { accountSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { assertPersonInHousehold } from "@/server/guards";

export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const input = accountSchema.parse(await request.json());
    await assertPersonInHousehold(input.personId, householdId);
    const account = await prisma.account.create({
      data: {
        personId: input.personId,
        name: input.name,
        accountType: input.accountType,
        isActive: input.isActive,
      },
      select: { id: true, personId: true, name: true, accountType: true, isActive: true },
    });
    await audit({ userId, entityType: "account", entityId: account.id, action: "create", newValue: account });
    return json(account, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
