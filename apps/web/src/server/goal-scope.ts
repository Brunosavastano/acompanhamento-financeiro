import type { Prisma } from "@prisma/client";

const legacyImportedSummaryTitles = ["TOTAL GERAL:", "MARCO"];
const legacyImportedSummaryMetricKeys = ["1", "500000", "1000000", "3000000", "10000000", "50000000", "100000000", "1000000000"];

export function visibleGoalWhere(householdId: string): Prisma.GoalWhereInput {
  return {
    householdId,
    // Old imports could include summary/projection rows from the spreadsheet as goals.
    NOT: [
      { title: { in: legacyImportedSummaryTitles } },
      { metricKey: { in: legacyImportedSummaryMetricKeys } },
    ],
  };
}
