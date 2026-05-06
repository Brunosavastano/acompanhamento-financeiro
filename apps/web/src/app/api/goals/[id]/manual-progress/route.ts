import { z } from "zod";
import { getCurrentUserId, getRequiredHouseholdId } from "@/lib/authz";
import { errorResponse, json } from "@/lib/api";
import { asMonthStart } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/audit";

const schema = z.object({
  periodMonth: z.string(),
  currentValue: z.string(),
  progressPct: z.coerce.number().min(0).max(1),
  status: z.enum(["achieved", "in_progress", "attention", "long_term"]).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const householdId = await getRequiredHouseholdId();
    const userId = await getCurrentUserId();
    const { id } = await params;
    const input = schema.parse(await request.json());
    await prisma.goal.findFirstOrThrow({ where: { id, householdId } });
    const periodMonth = asMonthStart(input.periodMonth);
    const progress = await prisma.goalProgressSnapshot.upsert({
      where: { goalId_periodMonth: { goalId: id, periodMonth } },
      create: {
        goalId: id,
        periodMonth,
        currentValue: input.currentValue,
        progressPct: input.progressPct,
        status: input.status ?? (input.progressPct >= 1 ? "achieved" : "in_progress"),
      },
      update: {
        currentValue: input.currentValue,
        progressPct: input.progressPct,
        status: input.status ?? (input.progressPct >= 1 ? "achieved" : "in_progress"),
      },
    });
    await audit({ userId, entityType: "goal_progress_snapshot", entityId: progress.id, action: "manual-progress", newValue: progress });
    return json(progress);
  } catch (error) {
    return errorResponse(error);
  }
}
