import { z } from "zod";

export const periodMonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}(-01)?$/, "Use YYYY-MM or YYYY-MM-01")
  .transform((value) => (value.length === 7 ? `${value}-01` : value));

export const moneySchema = z.coerce.number().finite();

export const createSnapshotSchema = z.object({
  periodMonth: periodMonthSchema,
  selicAnnual: z.coerce.number().min(0).max(1).optional(),
  notes: z.string().max(2000).optional(),
});

export const updatePositionSchema = z.object({
  personId: z.string().min(1),
  accountId: z.string().min(1).optional().nullable(),
  category: z.enum(["cash", "benefit", "investment", "cashback"]),
  amount: moneySchema,
  // Proveniência: saldos sugeridos pelo leitor de prints são gravados como
  // "ai_extracted" (auditáveis/reversíveis); digitação manual continua "manual".
  source: z.enum(["manual", "ai_extracted"]).optional(),
});

export const debtCashflowSchema = z
  .object({
    personId: z.string().min(1),
    cardName: z.string().min(1).default("Cartão principal"),
    invoiceMonth: periodMonthSchema,
    paymentMonth: periodMonthSchema,
    amount: moneySchema,
    description: z.string().max(500).optional().nullable(),
  })
  .refine((input) => input.paymentMonth >= input.invoiceMonth, {
    path: ["paymentMonth"],
    message: "O vencimento não pode ser anterior ao mês da fatura.",
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

// --- IA: leitor de prints ---------------------------------------------------

// Saída ESTRUTURADA que o modelo de visão deve produzir (generateObject).
// O modelo devolve `candidateIndex` (1..N no inventário montado no servidor),
// nunca um id de conta — e `amountRaw` é a string vista no print, normalizada
// depois pelo servidor (nunca pelo modelo).
export const statementReadSchema = z.object({
  reads: z.array(
    z.object({
      candidateIndex: z.number().int().min(1).nullable(),
      detectedInstitution: z.string().max(80),
      detectedHolder: z.string().max(80).nullable(),
      suggestedCategory: z.enum(["cash", "benefit", "investment", "cashback", "other"]),
      amountRaw: z.string().max(32),
      confidence: z.number().min(0).max(1),
      note: z.string().max(160).nullable(),
    }),
  ),
  warnings: z.array(z.string().max(160)),
});
export type StatementReadModelOutput = z.infer<typeof statementReadSchema>;

export type StatementReadFlag =
  | "unparseable"
  | "ambiguous_magnitude"
  | "large_delta"
  | "no_match"
  | "low_confidence"
  | "collision";

// Resposta que a rota devolve ao cliente (já normalizada e conferida no servidor).
export type StatementReadResultRow = {
  candidateIndex: number | null;
  positionId: string | null;
  accountLabel: string;
  detectedInstitution: string;
  amount: string | null; // decimal com ponto ("1234.56"), ou null se não parseável
  previousAmount: string | null;
  deltaFactor: number | null;
  flags: StatementReadFlag[];
  confidence: number;
  note: string | null;
};
export type StatementReadResult = {
  reads: StatementReadResultRow[];
  warnings: string[];
  notFilled: Array<{ positionId: string; accountLabel: string }>;
};

// --- IA: bot de dúvidas -----------------------------------------------------

export const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
export const assistantChatSchema = z.object({
  messages: z.array(assistantMessageSchema).min(1).max(20),
});
export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

export type CreateSnapshotInput = z.infer<typeof createSnapshotSchema>;
export type DebtCashflowInput = z.infer<typeof debtCashflowSchema>;
export type BudgetItemInput = z.infer<typeof budgetItemSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type PersonInput = z.infer<typeof personSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
