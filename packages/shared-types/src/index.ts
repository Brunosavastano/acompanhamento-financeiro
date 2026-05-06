import { z } from "zod";

export const periodMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}(-01)?$/, "Use YYYY-MM or YYYY-MM-01")
  .transform((value) => (value.length === 7 ? `${value}-01` : value));

export const moneySchema = z.coerce.number().finite();

export const createSnapshotSchema = z.object({
  periodMonth: periodMonthSchema,
  selicAnnual: z.coerce.number().min(0).max(1),
  notes: z.string().max(2000).optional(),
});

export const updatePositionSchema = z.object({
  personId: z.string().min(1),
  accountId: z.string().min(1).optional().nullable(),
  category: z.enum(["cash", "benefit", "investment", "cashback"]),
  amount: moneySchema,
});

export const debtCashflowSchema = z
  .object({
    personId: z.string().min(1),
    cardName: z.string().min(1).default("Cartao principal"),
    invoiceMonth: periodMonthSchema,
    paymentMonth: periodMonthSchema,
    amount: moneySchema,
    description: z.string().max(500).optional().nullable(),
  })
  .refine((input) => input.paymentMonth >= input.invoiceMonth, {
    path: ["paymentMonth"],
    message: "O vencimento nao pode ser anterior ao mes da fatura.",
  });

export const budgetItemSchema = z.object({
  personId: z.string().optional().nullable(),
  name: z.string().min(1),
  kind: z.enum(["income", "fixed_expense", "variable_expense"]),
  amountMonthly: moneySchema,
  recurrence: z.enum(["monthly", "annualized", "one_off"]).default("monthly"),
  startMonth: periodMonthSchema,
  endMonth: periodMonthSchema.optional().nullable(),
  isActive: z.boolean().default(true),
});

export const goalSchema = z.object({
  title: z.string().min(1),
  horizon: z.enum(["short", "medium", "long"]),
  metricKey: z.string().min(1),
  targetValue: z.union([moneySchema, z.string()]).nullable(),
  targetDate: z.string().nullable().optional(),
  comparisonOperator: z.enum(["greater_or_equal", "less_or_equal", "equals", "manual"]),
  riskCapValue: moneySchema.optional().nullable(),
  manualCurrentValue: z.union([moneySchema, z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const personSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.enum(["owner", "spouse", "dependent"]),
});

export const accountSchema = z.object({
  personId: z.string().min(1),
  name: z.string().min(1).max(120),
  accountType: z.enum(["cash", "benefit", "investment", "cashback", "other"]),
  isActive: z.boolean().default(true),
});

export const importExcelSchema = z.object({
  filePath: z.string().min(1).optional(),
});

export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
export type DebtCashflowInput = z.infer<typeof debtCashflowSchema>;
export type BudgetItemInput = z.infer<typeof budgetItemSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type PersonInput = z.infer<typeof personSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
