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

const debtCashflowBase = z.object({
  personId: z.string().min(1),
  cardName: z.string().min(1).default("Cartão principal"),
  invoiceMonth: periodMonthSchema,
  paymentMonth: periodMonthSchema,
  amount: moneySchema,
  description: z.string().max(500).optional().nullable(),
});

export const debtCashflowSchema = debtCashflowBase.refine((input) => input.paymentMonth >= input.invoiceMonth, {
  path: ["paymentMonth"],
  message: "O vencimento não pode ser anterior ao mês da fatura.",
});

// Criação: por padrão SUBSTITUI o valor já declarado para (pessoa, cartão, base,
// vencimento) — o fluxo real é "declarar o total projetado da fatura do mês".
// "add" preserva o caso de parcela avulsa que soma ao mês.
export const createDebtCashflowSchema = debtCashflowBase
  .extend({ mode: z.enum(["replace", "add"]).default("replace") })
  .refine((input) => input.paymentMonth >= input.invoiceMonth, {
    path: ["paymentMonth"],
    message: "O vencimento não pode ser anterior ao mês da fatura.",
  });

export const debtBulkSchema = z
  .object({
    personId: z.string().min(1),
    cardName: z.string().min(1).default("Cartão principal"),
    invoiceMonth: periodMonthSchema,
    mode: z.enum(["replace", "add"]).default("replace"),
    entries: z
      .array(
        z.object({
          paymentMonth: periodMonthSchema,
          amount: moneySchema,
          description: z.string().max(500).optional().nullable(),
        }),
      )
      .min(1)
      .max(36),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    input.entries.forEach((entry, index) => {
      if (entry.paymentMonth < input.invoiceMonth) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entries", index, "paymentMonth"],
          message: "O vencimento não pode ser anterior ao mês da fatura.",
        });
      }
      if (seen.has(entry.paymentMonth)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["entries", index, "paymentMonth"],
          message: "Há mais de um valor para o mesmo mês de vencimento.",
        });
      }
      seen.add(entry.paymentMonth);
    });
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

// --- IA: leitor de prints de saldos (passo 2 do fechamento) -----------------

// Saída ESTRUTURADA do modelo de visão para prints de apps de banco, corretora
// e benefícios. O modelo só DESCREVE o que vê (banco, rótulo, titular, tipo e o
// valor como texto): o casamento com as contas da família e a normalização do
// valor são do servidor, nunca do modelo. Sem limites de tamanho/intervalo aqui
// de propósito — um texto longo não pode derrubar a leitura inteira; o servidor
// corta e confere depois.
export const balanceReadModelSchema = z.object({
  reads: z.array(
    z.object({
      imageIndex: z.number().nullable(),
      institution: z.string(),
      accountLabel: z.string().nullable(),
      holderName: z.string().nullable(),
      kind: z.enum(["cash", "benefit", "investment", "cashback", "other"]),
      amountRaw: z.string(),
      excerpt: z.string(),
      confidence: z.number(),
      note: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type BalanceReadModelOutput = z.infer<typeof balanceReadModelSchema>;

export type BalanceReadFlag =
  | "unparseable"
  | "ambiguous_magnitude"
  | "low_confidence"
  | "large_delta"
  | "no_match"
  | "ambiguous_match"
  | "weak_match"
  | "kind_mismatch"
  | "duplicate_target"
  | "holder_unmatched";

// Resposta da rota ao cliente: cada leitura com o valor normalizado no servidor
// e a conta SUGERIDA (linha do rascunho), para a pessoa confirmar ou trocar.
export type BalanceReadRow = {
  imageIndex: number | null; // 1 = primeiro print enviado
  detectedInstitution: string;
  detectedLabel: string | null;
  detectedHolder: string | null;
  kind: "cash" | "benefit" | "investment" | "cashback" | "other";
  excerpt: string; // trecho lido no print, como exibido
  amountRaw: string; // valor como exibido no print
  amount: string | null; // decimal com ponto ("1234.56"), ou null se não parseável
  confidence: number; // 0 a 1, do modelo, sobre a leitura do valor
  positionId: string | null; // linha sugerida do rascunho, ou null
  positionLabel: string | null; // "Pessoa — Conta" da sugestão
  matchReason: "name" | "category" | null;
  candidatePositionIds: string[]; // alternativas quando o casamento não é único
  previousAmount: string | null; // saldo da conta sugerida no último fechamento
  flags: BalanceReadFlag[];
  note: string | null;
};
export type BalanceReadResult = {
  reads: BalanceReadRow[];
  warnings: string[];
};

// --- IA: leitor de print de fatura (Cartão e dívidas) -----------------------

// Saída ESTRUTURADA do modelo de visão para telas de "próximas faturas" de apps
// de banco (uma linha por mês). `monthLabel`/`amountRaw` são o TEXTO VISTO no
// print — a normalização (mês e valor) é sempre do servidor, nunca do modelo.
export const invoiceReadModelSchema = z.object({
  rows: z.array(
    z.object({
      monthLabel: z.string().max(40),
      kind: z.enum(["current", "future", "past", "unknown"]),
      amountRaw: z.string().max(32),
      note: z.string().max(160).nullable(),
    }),
  ),
  warnings: z.array(z.string().max(160)),
});
export type InvoiceReadModelOutput = z.infer<typeof invoiceReadModelSchema>;

export type InvoiceReadFlag = "unparseable" | "ambiguous_magnitude" | "month_unresolved" | "before_base" | "past_invoice";

// Resposta da rota ao cliente, já normalizada e sinalizada para revisão humana.
export type InvoiceReadRow = {
  monthLabel: string;
  paymentMonth: string | null; // "YYYY-MM-01" ou null se o mês não foi resolvido
  currentInvoice: boolean;
  amount: string | null; // decimal com ponto ("1234.56"), ou null se não parseável
  flags: InvoiceReadFlag[];
  note: string | null;
};
export type InvoiceReadResult = {
  rows: InvoiceReadRow[];
  warnings: string[];
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
export type CreateDebtCashflowInput = z.infer<typeof createDebtCashflowSchema>;
export type DebtBulkInput = z.infer<typeof debtBulkSchema>;
export type BudgetItemInput = z.infer<typeof budgetItemSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type PersonInput = z.infer<typeof personSchema>;
export type AccountInput = z.infer<typeof accountSchema>;
