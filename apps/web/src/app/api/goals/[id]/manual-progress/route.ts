import { z } from "zod";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";
import { isComputedGoal } from "@/server/goal-progress";

const schema = z.object({
  periodMonth: z.string(),
  currentValue: z.string(),
  progressPct: z.coerce.number().min(0).max(1),
  status: z.enum(["achieved", "in_progress", "attention", "long_term"]).optional(),
});

/**
 * Registro de progresso de uma meta manual (ou numérica sem métrica do app)
 * num mês. É o registro com data que vale daquele mês em diante, até o próximo.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = schema.parse(await request.json());
    const goal = await prisma.goal.findFirstOrThrow({ where: { id, householdId } });
    if (isComputedGoal(goal)) {
      return json(
        { error: "Esta meta é calculada automaticamente pelo app a cada fechamento; o progresso não é informado à mão." },
        { status: 409 },
      );
    }
    const periodMonth = asMonthStart(input.periodMonth);
    const status = input.status ?? (input.progressPct >= 1 ? "achieved" : "in_progress");
    const previous = await prisma.goalProgressSnapshot.findUnique({ where: { goalId_periodMonth: { goalId: id, periodMonth } } });
    const progress = await prisma.goalProgressSnapshot.upsert({
      where: { goalId_periodMonth: { goalId: id, periodMonth } },
      create: { goalId: id, periodMonth, currentValue: input.currentValue, progressPct: input.progressPct, status },
      update: { currentValue: input.currentValue, progressPct: input.progressPct, status },
    });
    await audit({
      userId,
      entityType: "goal_progress_snapshot",
      entityId: progress.id,
      action: "manual-progress",
      oldValue: previous ?? undefined,
      newValue: progress,
    });
    return json(progress);
  } catch (error) {
    return errorResponse(error);
  }
}
