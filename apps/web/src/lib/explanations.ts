// Textos do ⓘ de cada card e painel: o que o número é e como é calculado, em
// português simples. Os limites citados vêm das mesmas constantes que os
// selos e os alertas usam, então o texto não fica desatualizado.

import {
  DEBT_TO_ASSETS_BANDS,
  DEFAULT_RESERVE_TARGET_MONTHS,
  INCOME_COMMITMENT_BANDS,
  RESERVE_BANDS,
} from "@/lib/health";
import {
  ACCOUNT_ZEROED_MIN_PREVIOUS,
  DEBT_RISING_MIN_STEPS,
  INVOICE_ALERT_MIN_DIFFERENCE,
  INVOICE_ALERT_RATIO,
  UPCOMING_SHARE_OF_AVERAGE,
  UPCOMING_WINDOW_MONTHS,
  brl0,
  wholePercent,
} from "@/lib/insights";

export type Explanation = {
  /** Nome acessível do botão ⓘ. */
  label: string;
  title: string;
  paragraphs: string[];
  items?: string[];
};

/** Avisos que só existem na visão geral (a reserva e o fechamento são da família). */
const FAMILY_ONLY_RULES = {
  reserve: "reserva de emergência abaixo da meta;",
  close: "mês que já começou e ainda não foi fechado;",
};

const EXPLANATIONS = {
  resumo: {
    label: "Como estas frases são montadas",
    title: "O que mudou",
    paragraphs: [
      "Frases montadas automaticamente com os números desta página, sem inteligência artificial.",
      "Comparam este fechamento com o anterior. Se um mês ficou sem fechar, a comparação cobre o intervalo todo.",
    ],
  },
  alertas: {
    label: "Quando aparece um ponto de atenção",
    title: "Pontos de atenção",
    paragraphs: ["Avisos automáticos, que só aparecem quando um número passa de um limite:"],
    items: [
      `fatura do mês ${wholePercent(INVOICE_ALERT_RATIO)} ou mais acima da média de 12 meses (e pelo menos ${brl0(INVOICE_ALERT_MIN_DIFFERENCE)} a mais);`,
      `total a pagar do cartão subindo há ${DEBT_RISING_MIN_STEPS} meses ou mais;`,
      FAMILY_ONLY_RULES.reserve,
      `conta no vermelho, ou que zerou depois de ter pelo menos ${brl0(ACCOUNT_ZEROED_MIN_PREVIOUS)};`,
      FAMILY_ONLY_RULES.close,
      `parcelas já lançadas que, num dos próximos ${UPCOMING_WINDOW_MONTHS} meses, somam ${wholePercent(UPCOMING_SHARE_OF_AVERAGE)} ou mais da fatura média;`,
      "quem tinha dívida no cartão e não a declarou no mês.",
    ],
  },
  patrimonio: {
    label: "O que é o patrimônio líquido",
    title: "Patrimônio líquido",
    paragraphs: [
      "É o caixa mais os investimentos, menos as dívidas do cartão, com os saldos informados no fechamento do mês.",
      "A variação compara com o fechamento anterior; se um mês ficou sem fechar, ela cobre os dois meses. A média é por mês, nos últimos 12 meses.",
    ],
  },
  caixa: {
    label: "O que é o caixa disponível",
    title: "Caixa disponível",
    paragraphs: ["Dinheiro em conta mais o saldo de VR/VA, no fechamento do mês."],
  },
  investimentos: {
    label: "O que entra em investimentos",
    title: "Investimentos",
    paragraphs: ["Saldo das aplicações mais o cashback acumulado, no fechamento do mês."],
  },
  dividas: {
    label: "O que são as dívidas do cartão",
    title: "Dívidas do cartão",
    paragraphs: [
      "Parcelas do cartão que ainda vão vencer, declaradas no fechamento do mês.",
      "Cada parcela é descontada pela Selic do fechamento (o chamado valor presente): quanto mais longe o vencimento, menos ela pesa hoje. É esse valor que entra no patrimônio.",
    ],
  },
  reserva: {
    label: "Como a reserva é calculada",
    title: "Reserva de emergência",
    paragraphs: [
      "Quantos meses de gastos o caixa (dinheiro em conta mais VR/VA) consegue pagar. Os gastos são os previstos no orçamento, com a média do cartão.",
      `A meta vem da página Metas (meses de reserva); sem ela, vale ${DEFAULT_RESERVE_TARGET_MONTHS} meses. A partir de ${wholePercent(RESERVE_BANDS.almost)} da meta, o selo diz “quase lá”; abaixo de ${wholePercent(RESERVE_BANDS.building)}, “atenção”.`,
    ],
  },
  saudeDividas: {
    label: "Como o nível das dívidas é medido",
    title: "Dívidas",
    paragraphs: [
      "Compara as dívidas do cartão (a valor presente) com tudo o que a família tem em caixa e investimentos.",
      `Até ${wholePercent(DEBT_TO_ASSETS_BANDS.controlled)}, sob controle; acima de ${wholePercent(DEBT_TO_ASSETS_BANDS.attention)}, alto.`,
    ],
  },
  sobraPlanejada: {
    label: "De onde vem a sobra planejada",
    title: "Sobra planejada",
    paragraphs: [
      "Vem do orçamento, não do realizado: é a renda prevista menos as despesas previstas, com a média do cartão.",
      "O que de fato sobrou aparece na variação do patrimônio, no topo da página.",
    ],
  },
  rendaComprometida: {
    label: "O que é a renda comprometida",
    title: "Renda comprometida",
    paragraphs: [
      "Parte da renda prevista no orçamento que já tem destino: contas fixas, gastos variáveis e a média do cartão.",
      `Até ${wholePercent(INCOME_COMMITMENT_BANDS.comfortable)}, confortável; acima de ${wholePercent(INCOME_COMMITMENT_BANDS.attention)}, crítico.`,
    ],
  },
  evolucao: {
    label: "Como ler a evolução",
    title: "Evolução",
    paragraphs: [
      "Saldos de cada mês fechado. Caixa inclui VR/VA, investimentos incluem cashback e as dívidas entram a valor presente, como no patrimônio.",
      "Os botões escolhem as linhas do gráfico. Cada conta tem o próprio minigráfico, que amplia com um clique.",
    ],
  },
  dividasPainel: {
    label: "Como ler as dívidas do cartão",
    title: "Dívidas do cartão",
    paragraphs: [
      "Total a pagar: soma das parcelas declaradas no fechamento, pelo valor cheio (sem o desconto da Selic).",
      "Fatura do mês: o que vence no próprio mês; a barra fica mais clara quando o mês não teve declaração própria. Média: faturas dos últimos 12 meses, sem contar meses sem fatura.",
      "Em Próximos meses, as parcelas já lançadas que ainda vão vencer.",
    ],
  },
  variacaoMensal: {
    label: "Como ler a variação mensal",
    title: "Variação mensal",
    paragraphs: [
      "Quanto o patrimônio mudou de um fechamento para o seguinte: barra verde quando subiu, rosa quando caiu.",
      "A linha tracejada é a média por mês. Se um mês ficou sem fechar, a barra seguinte cobre os dois meses.",
    ],
  },
  composicao: {
    label: "Como ler de onde vem o patrimônio",
    title: "De onde vem o patrimônio",
    paragraphs: [
      "Como os bens se dividem no fechamento: investimentos (com cashback), dinheiro em conta e VR/VA. As duas partes de caixa somam o card “Caixa disponível”.",
      "As dívidas do cartão não entram na barra: aparecem embaixo, descontando do total.",
    ],
  },
  metas: {
    label: "Como as metas em andamento são escolhidas",
    title: "Metas em andamento",
    paragraphs: [
      "Até três metas ainda não alcançadas, começando pelas de curto prazo e pelas mais adiantadas.",
      "Metas ligadas a números do app, como os meses de reserva, se atualizam sozinhas a cada fechamento; as outras usam o último progresso informado na página Metas.",
    ],
  },
  mesAMes: {
    label: "Como ler a tabela mês a mês",
    title: "Mês a mês",
    paragraphs: [
      "Saldo de cada conta no fechamento de cada mês, com os totais de caixa (com VR/VA) e de investimentos (com cashback).",
      "As dívidas do cartão aparecem a valor presente e já saem do patrimônio; a última linha mostra quanto ele mudou desde o mês anterior.",
    ],
  },
} satisfies Record<string, Explanation>;

export type ExplanationTopic = keyof typeof EXPLANATIONS;

/** Explicação de um card ou painel; `extra` acrescenta frases com números da página (ex.: o valor cheio das parcelas). */
export function explain(topic: ExplanationTopic, extra: Array<string | null | undefined> = []): Explanation {
  const base: Explanation = EXPLANATIONS[topic];
  const more = extra.filter((text): text is string => Boolean(text));
  return more.length > 0 ? { ...base, paragraphs: [...base.paragraphs, ...more] } : base;
}

/** Regras dos pontos de atenção; na página de uma pessoa, sem as que são só da família. */
export function explainAlerts(family: boolean): Explanation {
  const base: Explanation = EXPLANATIONS.alertas;
  if (family) return base;
  const familyOnly = new Set(Object.values(FAMILY_ONLY_RULES));
  return { ...base, items: base.items?.filter((item) => !familyOnly.has(item)) };
}

/** "Sem o desconto, as parcelas somam R$ 50.346." */
export function nominalDebtNote(nominal: number | null | undefined) {
  return nominal && nominal > 0 ? `Sem o desconto, as parcelas somam ${brl0(nominal)}.` : null;
}
