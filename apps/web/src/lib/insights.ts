// "O que mudou este mês" e "Pontos de atenção" (visão geral e página de cada
// pessoa). Frases e alertas saem daqui, de forma determinística, a partir dos
// mesmos números que a página já mostra: sem IA e sem gravar nada no banco.

import { number } from "@/lib/format";
import { RESERVE_BANDS, formatTargetMonths } from "@/lib/health";
import {
  FAMILY_SCOPE,
  INVOICE_ON_AVERAGE_TOLERANCE,
  debtBridge,
  debtRows,
  invoiceComparison,
  monthGap,
  outlookRows,
  summaryRows,
  type DebtRow,
  type EvolutionAccount,
  type EvolutionData,
  type EvolutionMonth,
  type InvoiceComparison,
  type Scope,
} from "@/lib/evolution";

// ---------------------------------------------------------------------------
// Limites dos alertas
// ---------------------------------------------------------------------------

/** Fatura do mês pelo menos 25% acima da média dos últimos 12 meses… */
export const INVOICE_ALERT_RATIO = 0.25;
/** …e pelo menos R$ 500 acima dela: fatura pequena não vira aviso. */
export const INVOICE_ALERT_MIN_DIFFERENCE = 500;
/** Total a pagar do cartão subindo em pelo menos 3 fechamentos seguidos. */
export const DEBT_RISING_MIN_STEPS = 3;
/** Conta que tinha pelo menos R$ 100 no fechamento anterior e chegou a zero. */
export const ACCOUNT_ZEROED_MIN_PREVIOUS = 100;
/** Parcelas já lançadas: olha os 3 meses seguintes ao fechamento… */
export const UPCOMING_WINDOW_MONTHS = 3;
/** …e avisa quando um deles já soma pelo menos metade da fatura média de 12 meses. */
export const UPCOMING_SHARE_OF_AVERAGE = 0.5;

// ---------------------------------------------------------------------------
// Regras das frases
// ---------------------------------------------------------------------------

/** Variação abaixo de R$ 100 (ou de 0,1% do patrimônio, o que for maior) é "praticamente igual". */
export const STABLE_CHANGE_MIN = 100;
export const STABLE_CHANGE_SHARE = 0.001;
/** Movimentos menores que R$ 50 ficam fora de "o que mais pesou". */
export const MOVER_MIN = 50;
/** O segundo maior movimento no mesmo sentido entra quando tem pelo menos metade do primeiro. */
export const SECOND_MOVER_SHARE = 0.5;
/** O maior movimento no sentido contrário entra quando passa de 30% da variação do mês. */
export const COUNTER_MOVER_SHARE = 0.3;
/** Dois movimentos opostos que quase se anulam (até 10% de diferença) parecem dinheiro mudando de conta. */
export const TRANSFER_TOLERANCE = 0.1;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Tone = "positive" | "negative";
/** Trecho de frase: texto corrido ou número em destaque (a cor só reforça o que o texto diz). */
export type Part = string | { text: string; tone?: Tone };
export type InsightSentence = { key: "patrimonio" | "movimentos" | "cartao" | "reserva" | "vazio"; parts: Part[] };

export type AlertKind =
  | "missing_debt_declaration"
  | "account_negative"
  | "close_pending"
  | "reserve_below_goal"
  | "invoice_above_average"
  | "debt_rising"
  | "upcoming_installments"
  | "account_zeroed";
export type AlertSeverity = "high" | "medium";
export type InsightAlert = { kind: AlertKind; severity: AlertSeverity; title: string; parts: Part[] };

export type MonthInsights = { title: string; sentences: InsightSentence[]; alerts: InsightAlert[] };

export type ReserveInput = {
  /** Meses de reserva do card "Caixa disponível". */
  months: number;
  /** Meses de reserva no fechamento anterior (null no primeiro mês). */
  previousMonths: number | null;
  targetMonths: number;
  cashTotal: number;
  /** Gastos do orçamento por mês (o divisor dos meses de reserva). */
  monthlyExpenses: number;
};

export type InsightsInput = {
  evolution: Pick<EvolutionData, "people" | "accounts" | "months" | "debt">;
  /** FAMILY_SCOPE ou o id da pessoa. */
  scope: Scope;
  /**
   * Patrimônio e variação exatamente como no card do topo da mesma página
   * (`change` null no primeiro mês fechado): o texto nunca diverge do card.
   */
  netWorth: { value: number; change: number | null };
  /** Só na visão geral: reserva de emergência e meta. */
  reserve?: ReserveInput | null;
  /** Mês de hoje ("AAAA-MM"), só quando a página mostra o último mês fechado: liga o aviso de mês por fechar. */
  today?: string | null;
};

// ---------------------------------------------------------------------------
// Formatação (mesmos formatos dos cards: reais inteiros, meses com 1 casa)
// ---------------------------------------------------------------------------

const wholeReais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** R$ sem centavos, como nos selos de variação da página. */
export function brl0(value: number) {
  return wholeReais.format(value);
}

/** "+R$ 1.234", "−R$ 1.234" ou "R$ 0". */
export function signedBrl0(value: number) {
  const text = brl0(Math.abs(value));
  if (text === brl0(0)) return text;
  return `${value > 0 ? "+" : "−"}${text}`;
}

/** 0,234 → "23%". */
export function wholePercent(ratio: number) {
  return `${Math.round(Math.abs(ratio) * 100)}%`;
}

function monthDate(month: string) {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1, 1));
}

/** "2026-10" → "outubro". */
export function monthLong(month: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(monthDate(month));
}

function monthWithYear(month: string) {
  return `${monthLong(month)} de ${month.slice(0, 4)}`;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2026-10" + 2 → "2026-12". */
export function shiftMonth(month: string, delta: number) {
  const date = monthDate(month);
  const shifted = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Nomes dos dois meses de um intervalo, com o ano só quando ele muda. */
function rangeNames(from: string, to: string) {
  return from.slice(0, 4) === to.slice(0, 4) ? [monthLong(from), monthLong(to)] : [monthWithYear(from), monthWithYear(to)];
}

function joinList(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Junta listas de trechos com vírgulas e "e". */
function joinParts(items: Part[][]): Part[] {
  return items.flatMap((item, index) => (index === 0 ? item : [index === items.length - 1 ? " e " : ", ", ...item]));
}

function firstName(name: string) {
  return name.split(" ")[0];
}

const round2 = (value: number) => Math.round(value * 100) / 100;

const strong = (text: string, tone?: Tone): Part => (tone ? { text, tone } : { text });
const toneOf = (value: number): Tone | undefined => (value > 0 ? "positive" : value < 0 ? "negative" : undefined);

// ---------------------------------------------------------------------------
// Contexto do mês
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<EvolutionAccount["category"], string> = {
  cash: "Caixa",
  benefit: "VR/VA",
  investment: "Investimentos",
  cashback: "Cashback",
};

type Context = {
  input: InsightsInput;
  family: boolean;
  /** "da família" ou "de Tatiane". */
  subject: string;
  names: Map<string, string>;
  personIds: string[];
  accounts: EvolutionAccount[];
  month: string;
  previousMonth: string | null;
  /** Meses entre o fechamento anterior e este (2 quando um mês ficou sem fechar). */
  gap: number;
  current: EvolutionMonth;
  previous: EvolutionMonth | null;
  debts: DebtRow[];
  debt: DebtRow | undefined;
  previousDebt: DebtRow | null;
};

function makeContext(input: InsightsInput): Context | null {
  const { evolution, scope } = input;
  const current = evolution.months[evolution.months.length - 1];
  if (!current) return null;
  const previous = evolution.months.length > 1 ? evolution.months[evolution.months.length - 2] : null;
  const family = scope === FAMILY_SCOPE;
  const names = new Map(evolution.people.map((person) => [person.id, firstName(person.name)]));
  const debts = debtRows(evolution, scope);
  return {
    input,
    family,
    subject: family ? "da família" : `de ${names.get(scope) ?? "?"}`,
    names,
    personIds: family ? evolution.people.map((person) => person.id) : [scope],
    accounts: evolution.accounts.filter((account) => family || account.personId === scope),
    month: current.month,
    previousMonth: previous?.month ?? null,
    gap: previous ? Math.max(1, monthGap(previous.month, current.month)) : 1,
    current,
    previous,
    debts,
    debt: debts[debts.length - 1],
    previousDebt: debts.length > 1 ? debts[debts.length - 2] : null,
  };
}

function isFirstMonth(ctx: Context) {
  return ctx.previous === null || ctx.input.netWorth.change === null;
}

function isStable(ctx: Context) {
  const change = ctx.input.netWorth.change ?? 0;
  const before = ctx.input.netWorth.value - change;
  return Math.abs(change) < Math.max(STABLE_CHANGE_MIN, STABLE_CHANGE_SHARE * Math.abs(before));
}

/** Conta com o dono na visão da família ("Nubank de Bruno"); o tipo só aparece se o nome se repete. */
function accountLabel(ctx: Context, account: EvolutionAccount) {
  const repeated = ctx.accounts.filter((item) => item.personId === account.personId && item.name === account.name).length > 1;
  const name = repeated ? `${account.name} (${CATEGORY_LABELS[account.category]})` : account.name;
  return ctx.family ? `${name} de ${ctx.names.get(account.personId) ?? "?"}` : name;
}

function balance(month: EvolutionMonth | null, key: string) {
  return round2(month?.balances[key] ?? 0);
}

/** A pessoa tem alguma declaração de cartão, mas não neste mês (ou no anterior): a dívida dela fica fora da conta. */
function debtMissing(ctx: Context, personId: string) {
  const months = ctx.input.evolution.debt.months;
  const at = (month: string | null) => months.find((row) => row.month === month)?.byPerson[personId];
  const now = at(ctx.month);
  const before = at(ctx.previousMonth);
  return (now !== undefined && now.outstanding === null) || (before !== undefined && before.outstanding === null);
}

function hasData(ctx: Context, personId: string) {
  return (
    ctx.input.evolution.accounts.some((account) => account.personId === personId) ||
    ctx.input.evolution.months.some((month) => (month.debtPv[personId] ?? 0) !== 0)
  );
}

// ---------------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------------

function title(ctx: Context) {
  if (isFirstMonth(ctx) || !ctx.previousMonth) return `Resumo de ${monthLong(ctx.month)}`;
  if (ctx.gap <= 1) return `O que mudou em ${monthLong(ctx.month)}`;
  const [from, to] = rangeNames(ctx.previousMonth, ctx.month);
  return `O que mudou de ${from} a ${to}`;
}

/** "Em outubro" ou "De agosto a outubro (setembro ficou sem fechar)". */
function periodPhrase(ctx: Context) {
  if (ctx.gap <= 1 || !ctx.previousMonth) return `Em ${monthLong(ctx.month)}`;
  const [from, to] = rangeNames(ctx.previousMonth, ctx.month);
  const skipped = Array.from({ length: ctx.gap - 1 }, (_, index) => shiftMonth(ctx.previousMonth!, index + 1));
  const note =
    skipped.length === 1
      ? `${monthLong(skipped[0])} ficou sem fechar`
      : skipped.length === 2
        ? `${monthLong(skipped[0])} e ${monthLong(skipped[1])} ficaram sem fechar`
        : `${skipped.length} meses ficaram sem fechar`;
  return `De ${from} a ${to} (${note})`;
}

/** Variação do patrimônio de cada pessoa, pela mesma conta da página dela. */
function personChanges(ctx: Context) {
  return ctx.input.evolution.people
    .filter((person) => hasData(ctx, person.id))
    .map((person) => {
      const rows = summaryRows(ctx.input.evolution, person.id);
      const now = rows[rows.length - 1];
      const before = rows[rows.length - 2];
      return { name: firstName(person.name), change: now.patrimonio - before.patrimonio };
    });
}

function headline(ctx: Context): InsightSentence {
  const { value, change } = ctx.input.netWorth;
  if (isFirstMonth(ctx) || change === null) {
    return {
      key: "patrimonio",
      parts: [
        `${capitalize(monthLong(ctx.month))} é o primeiro mês fechado: o patrimônio ${ctx.subject} começa em `,
        strong(brl0(value)),
        ". As comparações aparecem a partir do próximo fechamento.",
      ],
    };
  }
  const parts: Part[] = [`${periodPhrase(ctx)}, o patrimônio ${ctx.subject} `];
  if (isStable(ctx)) parts.push("ficou praticamente igual (", strong(signedBrl0(change)), ")");
  else parts.push(change > 0 ? "subiu " : "caiu ", strong(brl0(Math.abs(change)), toneOf(change)));
  if (ctx.family) {
    const people = personChanges(ctx);
    if (people.length >= 2) {
      parts.push(": ", ...joinParts(people.map((person) => [`${person.name} `, strong(signedBrl0(person.change), toneOf(person.change))])));
    }
  }
  parts.push(".");
  return { key: "patrimonio", parts };
}

type Mover = { kind: "account" | "debt"; label: string; change: number };

/** Contas e dívida do cartão de cada pessoa, pelo efeito no patrimônio desde o fechamento anterior. */
function movers(ctx: Context): Mover[] {
  if (!ctx.previous) return [];
  const list: Mover[] = ctx.accounts.map((account) => ({
    kind: "account",
    label: accountLabel(ctx, account),
    // Mesma conta do minigráfico de "Cada conta".
    change: balance(ctx.current, account.key) - balance(ctx.previous, account.key),
  }));
  for (const personId of ctx.personIds) {
    // Sem a declaração de um dos meses, a "queda" da dívida é falta de dado, não movimento.
    if (debtMissing(ctx, personId)) continue;
    const rows = summaryRows(ctx.input.evolution, personId);
    const now = rows[rows.length - 1];
    const before = rows[rows.length - 2];
    list.push({
      kind: "debt",
      label: ctx.family ? ` de ${ctx.names.get(personId) ?? "?"}` : "",
      // Dívida maior tira do patrimônio: mesmo número do card "Dívidas do cartão" da pessoa.
      change: -(now.dividas - before.dividas),
    });
  }
  return list.filter((mover) => Math.abs(mover.change) >= MOVER_MIN).sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/** "o saldo de XP de Bruno, que subiu R$ 8.000" (relative) ou "o saldo de XP de Bruno subiu R$ 8.000" (plain). */
function moverPhrase(mover: Mover, form: "relative" | "plain"): Part[] {
  const amount = strong(brl0(Math.abs(mover.change)), toneOf(mover.change));
  const link = form === "relative" ? ", que " : " ";
  if (mover.kind === "account") {
    return [`o saldo de ${mover.label}${link}${mover.change > 0 ? "subiu" : "caiu"} `, amount];
  }
  // O número da dívida é o efeito no patrimônio (valor presente), não o total a pagar.
  return mover.change < 0
    ? [`o aumento da dívida do cartão${mover.label}${link}tirou `, amount, " do patrimônio"]
    : [`a redução da dívida do cartão${mover.label}${link}somou `, amount, " ao patrimônio"];
}

function moversSentence(ctx: Context): InsightSentence | null {
  const change = ctx.input.netWorth.change;
  if (isFirstMonth(ctx) || change === null) return null;
  const all = movers(ctx);
  if (all.length === 0) return null;

  const stable = isStable(ctx);
  const direction = stable || change === 0 ? Math.sign(all[0].change) : Math.sign(change);
  const along = all.filter((mover) => Math.sign(mover.change) === direction);
  const against = all.filter((mover) => Math.sign(mover.change) === -direction);
  if (along.length === 0) return null;

  const main = [along[0]];
  if (along[1] && Math.abs(along[1].change) >= SECOND_MOVER_SHARE * Math.abs(along[0].change)) main.push(along[1]);
  const counter = against[0] && Math.abs(against[0].change) >= COUNTER_MOVER_SHARE * Math.abs(change) ? against[0] : null;
  const transfer =
    counter !== null &&
    main[0].kind === "account" &&
    counter.kind === "account" &&
    Math.abs(main[0].change + counter.change) <= TRANSFER_TOLERANCE * Math.max(Math.abs(main[0].change), Math.abs(counter.change));

  const lead =
    stable || transfer
      ? main.length > 1
        ? "Os maiores movimentos foram "
        : "O maior movimento foi "
      : main.length > 1
        ? "O que mais pesou foram "
        : "O que mais pesou foi ";
  const parts: Part[] = [lead, ...moverPhrase(main[0], "relative")];
  if (main[1]) parts.push(", e ", ...moverPhrase(main[1], "relative"));
  if (counter) {
    parts.push("; em sentido contrário, ", ...moverPhrase(counter, "plain"));
    if (transfer) parts.push(" (parece que o dinheiro só mudou de conta)");
  }
  parts.push(".");
  return { key: "movimentos", parts };
}

function invoiceAlertFires(comparison: InvoiceComparison | null) {
  return (
    comparison !== null &&
    !comparison.projected &&
    comparison.ratio >= INVOICE_ALERT_RATIO &&
    comparison.invoice - comparison.average >= INVOICE_ALERT_MIN_DIFFERENCE
  );
}

/** Cartão: compras novas e faturas que venceram (a ponte do painel de dívidas) e a fatura contra a média. */
function cardSentence(ctx: Context): InsightSentence | null {
  const current = ctx.debt;
  // Sem a declaração de alguém do recorte, o total do mês fica incompleto (o alerta explica).
  if (!current || current.missing.length > 0) return null;
  const bridge = isFirstMonth(ctx) ? null : debtBridge(current, ctx.previousDebt);
  const comparison = invoiceComparison(current);
  // No primeiro mês a média é a própria fatura; acima do limite, quem fala é o alerta.
  const showComparison = comparison !== null && !comparison.projected && !isFirstMonth(ctx) && !invoiceAlertFires(comparison);

  const parts: Part[] = [];
  if (bridge) {
    parts.push(
      ...(bridge.added >= 0
        ? ["No cartão, entraram ", strong(brl0(bridge.added)), " em compras novas e venceram ", strong(brl0(bridge.paid)), " em faturas"]
        : [
            "No cartão, venceram ",
            strong(brl0(bridge.paid)),
            " em faturas e as parcelas futuras diminuíram ",
            strong(brl0(Math.abs(bridge.added))),
            " (estornos ou ajustes)",
          ]),
    );
  }
  if (showComparison && comparison) {
    const intro = parts.length > 0 ? "; a fatura de " : "A fatura do cartão de ";
    parts.push(
      `${intro}${monthLong(comparison.month)} ficou `,
      ...(Math.abs(comparison.ratio) < INVOICE_ON_AVERAGE_TOLERANCE
        ? ["na média dos últimos 12 meses"]
        : [strong(wholePercent(comparison.ratio)), ` ${comparison.ratio > 0 ? "acima" : "abaixo"} da média dos últimos 12 meses`]),
    );
  }
  if (parts.length === 0) return null;
  parts.push(".");
  return { key: "cartao", parts };
}

function reserveSentence(ctx: Context): InsightSentence | null {
  const reserve = ctx.input.reserve;
  if (!reserve || reserve.monthlyExpenses <= 0) return null;
  const now = number(reserve.months, 1);
  const parts: Part[] = ["A reserva de emergência cobre ", strong(`${now} meses`), " de gastos"];
  if (reserve.previousMonths !== null && ctx.previousMonth && !isFirstMonth(ctx)) {
    const before = number(reserve.previousMonths, 1);
    parts.push(before === now ? ` (como em ${monthLong(ctx.previousMonth)})` : ` (eram ${before} em ${monthLong(ctx.previousMonth)})`);
  }
  // Abaixo da meta, o alerta "Reserva abaixo da meta" diz quanto falta.
  if (reserve.targetMonths > 0 && reserve.months >= reserve.targetMonths) {
    parts.push(`, e a meta de ${formatTargetMonths(reserve.targetMonths)} meses já foi alcançada`);
  }
  parts.push(".");
  return { key: "reserva", parts };
}

// ---------------------------------------------------------------------------
// Alertas
// ---------------------------------------------------------------------------

function missingDeclarationAlert(ctx: Context): InsightAlert | null {
  if (!ctx.previousMonth) return null;
  const months = ctx.input.evolution.debt.months;
  const now = months.find((row) => row.month === ctx.month)?.byPerson ?? {};
  const before = months.find((row) => row.month === ctx.previousMonth)?.byPerson ?? {};
  // Mesma regra do aviso do fechamento: tinha dívida no mês anterior e não declarou neste.
  const people = ctx.personIds.filter((id) => (before[id]?.outstanding ?? 0) > 0 && now[id] !== undefined && now[id].outstanding === null);
  if (people.length === 0) return null;
  const who = joinList(people.map((id) => ctx.names.get(id) ?? "?"));
  const single = people.length === 1;
  return {
    kind: "missing_debt_declaration",
    severity: "high",
    title: "Cartão sem declaração",
    parts: [
      `${who} não ${single ? "declarou" : "declararam"} as dívidas do cartão em ${monthLong(ctx.month)}`,
      ...(single ? [` (em ${monthLong(ctx.previousMonth)} havia `, strong(brl0(before[people[0]]?.outstanding ?? 0)), " a pagar)"] : []),
      ". Sem elas, o patrimônio aparece maior do que é.",
    ],
  };
}

function negativeAccountsAlert(ctx: Context): InsightAlert | null {
  const negatives = ctx.accounts
    .map((account) => ({ label: accountLabel(ctx, account), value: balance(ctx.current, account.key) }))
    .filter((item) => item.value < 0);
  if (negatives.length === 0) return null;
  const month = monthLong(ctx.month);
  return {
    kind: "account_negative",
    severity: "high",
    title: negatives.length > 1 ? "Contas no vermelho" : "Conta no vermelho",
    parts:
      negatives.length === 1
        ? ["O saldo de ", negatives[0].label, ` fechou ${month} em `, strong(signedBrl0(negatives[0].value), "negative"), "."]
        : [`Fecharam ${month} no vermelho: `, ...joinParts(negatives.map((item) => [`${item.label} (`, strong(signedBrl0(item.value), "negative"), ")"])), "."],
  };
}

function closePendingAlert(ctx: Context): InsightAlert | null {
  const today = ctx.input.today;
  if (!today) return null;
  const first = shiftMonth(ctx.month, 1);
  if (first > today) return null;
  const count = monthGap(first, today) + 1;
  const until = `os números desta página vão até ${monthLong(ctx.month)}.`;
  if (count === 1) {
    return { kind: "close_pending", severity: "medium", title: "Mês por fechar", parts: [`${capitalize(monthLong(first))} ainda não foi fechado: ${until}`] };
  }
  const [from, to] = rangeNames(first, today);
  return {
    kind: "close_pending",
    severity: "high",
    title: "Meses por fechar",
    parts: ["Faltam fechar ", strong(`${count} meses`), `, de ${from} a ${to}: ${until}`],
  };
}

function reserveAlert(ctx: Context): InsightAlert | null {
  const reserve = ctx.input.reserve;
  if (!reserve || reserve.monthlyExpenses <= 0 || reserve.targetMonths <= 0 || reserve.months >= reserve.targetMonths) return null;
  const missing = reserve.targetMonths * reserve.monthlyExpenses - reserve.cashTotal;
  if (missing <= 0) return null;
  return {
    kind: "reserve_below_goal",
    severity: reserve.months / reserve.targetMonths < RESERVE_BANDS.building ? "high" : "medium",
    title: "Reserva abaixo da meta",
    // Quantos meses o caixa cobre já está na frase da reserva; aqui, quanto falta.
    parts: [
      "Faltam cerca de ",
      strong(brl0(missing)),
      ` em caixa para a reserva cobrir os ${formatTargetMonths(reserve.targetMonths)} meses de gastos da meta.`,
    ],
  };
}

function invoiceAlert(ctx: Context): InsightAlert | null {
  if (isFirstMonth(ctx) || !ctx.debt || ctx.debt.missing.length > 0) return null;
  const comparison = invoiceComparison(ctx.debt);
  if (!invoiceAlertFires(comparison) || !comparison) return null;
  return {
    kind: "invoice_above_average",
    severity: "medium",
    title: "Fatura acima da média",
    parts: [
      `A fatura de ${monthLong(comparison.month)} (`,
      strong(brl0(comparison.invoice)),
      ") ficou ",
      strong(wholePercent(comparison.ratio)),
      " acima da média dos últimos 12 meses (",
      strong(brl0(comparison.average)),
      ").",
    ],
  };
}

function debtRisingAlert(ctx: Context): InsightAlert | null {
  const rows = ctx.debts;
  let steps = 0;
  for (let index = rows.length - 1; index > 0; index -= 1) {
    const now = rows[index];
    const before = rows[index - 1];
    if (now.outstanding === null || before.outstanding === null || now.missing.length > 0 || before.missing.length > 0) break;
    if (now.outstanding <= before.outstanding) break;
    steps += 1;
  }
  if (steps < DEBT_RISING_MIN_STEPS) return null;
  const start = rows[rows.length - 1 - steps];
  const end = rows[rows.length - 1];
  const [from, to] = rangeNames(start.month, end.month);
  return {
    kind: "debt_rising",
    severity: "medium",
    title: "Dívida do cartão subindo",
    parts: [
      "O total a pagar no cartão sobe há ",
      strong(`${monthGap(start.month, end.month)} meses`),
      " seguidos: foi de ",
      strong(brl0(start.outstanding ?? 0)),
      ` em ${from} para `,
      strong(brl0(end.outstanding ?? 0)),
      ` em ${to}.`,
    ],
  };
}

function upcomingAlert(ctx: Context): InsightAlert | null {
  const average = ctx.debt?.averageInvoice ?? null;
  if (average === null || average <= 0) return null;
  const last = shiftMonth(ctx.month, UPCOMING_WINDOW_MONTHS);
  const heavy = outlookRows(ctx.input.evolution, ctx.input.scope).filter(
    (row) => row.month > ctx.month && row.month <= last && row.amount >= UPCOMING_SHARE_OF_AVERAGE * average,
  );
  if (heavy.length === 0) return null;
  const listed = joinParts(heavy.map((row) => [strong(brl0(row.amount)), ` em ${monthLong(row.month)}`]));
  return {
    kind: "upcoming_installments",
    severity: "medium",
    title: "Parcelas grandes a vencer",
    parts:
      heavy.length === 1
        ? [
            "Só de compras já parceladas, vencem ",
            ...listed,
            ": ",
            strong(wholePercent(heavy[0].amount / average)),
            " da fatura média dos últimos 12 meses (",
            strong(brl0(average)),
            "), antes de qualquer compra nova.",
          ]
        : [
            "Só de compras já parceladas, vencem ",
            ...listed,
            `: em cada mês, pelo menos ${wholePercent(UPCOMING_SHARE_OF_AVERAGE)} da fatura média dos últimos 12 meses (`,
            strong(brl0(average)),
            "), antes de qualquer compra nova.",
          ],
  };
}

function zeroedAccountsAlert(ctx: Context): InsightAlert | null {
  if (!ctx.previous || !ctx.previousMonth) return null;
  const zeroed = ctx.accounts
    .map((account) => ({ label: accountLabel(ctx, account), before: balance(ctx.previous, account.key), now: balance(ctx.current, account.key) }))
    .filter((item) => item.now === 0 && item.before >= ACCOUNT_ZEROED_MIN_PREVIOUS);
  if (zeroed.length === 0) return null;
  const month = monthLong(ctx.month);
  const check = " Se não foi de propósito, vale conferir o fechamento.";
  return {
    kind: "account_zeroed",
    severity: "medium",
    title: zeroed.length > 1 ? "Contas zeradas" : "Conta zerada",
    parts:
      zeroed.length === 1
        ? ["O saldo de ", zeroed[0].label, ` zerou em ${month} (era `, strong(brl0(zeroed[0].before)), ` em ${monthLong(ctx.previousMonth)}).${check}`]
        : [`Zeraram em ${month}: `, ...joinParts(zeroed.map((item) => [`${item.label} (era `, strong(brl0(item.before)), ")"])), `.${check}`],
  };
}

function buildAlerts(ctx: Context): InsightAlert[] {
  const alerts = [
    missingDeclarationAlert(ctx),
    negativeAccountsAlert(ctx),
    closePendingAlert(ctx),
    reserveAlert(ctx),
    invoiceAlert(ctx),
    debtRisingAlert(ctx),
    upcomingAlert(ctx),
    zeroedAccountsAlert(ctx),
  ].filter((alert): alert is InsightAlert => alert !== null);
  return [...alerts.filter((alert) => alert.severity === "high"), ...alerts.filter((alert) => alert.severity === "medium")];
}

// ---------------------------------------------------------------------------

/**
 * Frases de "O que mudou" (2 a 4) e pontos de atenção do último mês de
 * `evolution`. Um assunto que vira alerta (fatura acima da média, reserva
 * abaixo da meta) sai da frase, para a mesma informação não aparecer duas vezes.
 */
export function buildMonthInsights(input: InsightsInput): MonthInsights {
  const ctx = makeContext(input);
  if (!ctx) return { title: "", sentences: [], alerts: [] };
  const hasAnything = ctx.accounts.length > 0 || ctx.personIds.some((id) => hasData(ctx, id));
  if (!hasAnything) {
    return { title: title(ctx), sentences: [{ key: "vazio", parts: [`Ainda não há saldos ${ctx.subject} nos meses fechados.`] }], alerts: [] };
  }
  const sentences = [headline(ctx), moversSentence(ctx), cardSentence(ctx), reserveSentence(ctx)].filter(
    (sentence): sentence is InsightSentence => sentence !== null,
  );
  return { title: title(ctx), sentences, alerts: buildAlerts(ctx) };
}

/** Texto corrido de uma frase ou alerta (testes e leitores de tela). */
export function partsText(parts: Part[]) {
  return parts.map((part) => (typeof part === "string" ? part : part.text)).join("");
}
