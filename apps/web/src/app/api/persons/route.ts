import { personSchema } from "@finance/shared-types";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

export async function GET() {
  try {
    const householdId = await getRequiredHouseholdId();
    const people = await prisma.person.findMany({
      where: { householdId },
      select: {
        id: true,
        name: true,
        role: true,
        accounts: {
          select: { id: true, personId: true, name: true, accountType: true, isActive: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    return json(people);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const input = personSchema.parse(await request.json());
    const person = await prisma.person.create({
      data: {
        householdId,
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
    await audit({ userId, entityType: "person", entityId: person.id, action: "create", newValue: person });
    return json(person, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
