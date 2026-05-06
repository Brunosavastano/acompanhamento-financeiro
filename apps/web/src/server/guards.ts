import { prisma } from "@/lib/prisma";

export async function assertPersonInHousehold(personId: string | null | undefined, householdId: string) {
  if (!personId) return;
  const person = await prisma.person.findFirst({
    where: { id: personId, householdId },
    select: { id: true },
  });
  if (!person) {
    throw new Response("Pessoa nao pertence a familia autenticada.", { status: 400 });
  }
}

export async function assertAccountInHousehold(accountId: string | null | undefined, householdId: string, personId?: string | null) {
  if (!accountId) return;
  const account = await prisma.account.findFirst({
    where: { id: accountId, person: { householdId, ...(personId ? { id: personId } : {}) } },
    select: { id: true },
  });
  if (!account) {
    throw new Response("Conta nao pertence a familia autenticada.", { status: 400 });
  }
}
