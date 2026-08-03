import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PrismaLike = typeof prisma | Prisma.TransactionClient;

export async function audit(
  input: {
    userId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  },
  // Passe o tx quando o log for a única cópia de um valor destruído na mesma
  // transação (ex.: replace de dívidas) — commit e auditoria ficam atômicos.
  db: PrismaLike = prisma,
) {
  // Sessões JWT sobrevivem a recriações do banco: o cookie pode apontar para um
  // id de usuário que não existe mais, e o FK derrubaria a gravação inteira.
  // Auditoria sem autor ("Sistema") é melhor que perder o lançamento.
  let userId = input.userId ?? null;
  if (userId) {
    const exists = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!exists) userId = null;
  }

  await db.auditLog.create({
    data: {
      userId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      oldValue: input.oldValue === undefined ? undefined : JSON.parse(JSON.stringify(input.oldValue)),
      newValue: input.newValue === undefined ? undefined : JSON.parse(JSON.stringify(input.newValue)),
      reason: input.reason ?? null,
    },
  });
}
