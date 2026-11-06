/**
 * Casamento determinístico entre os saldos lidos de prints e as linhas do
 * rascunho de fechamento. O modelo só descreve o que viu (banco, rótulo do
 * saldo, titular, tipo); quem decide a conta sugerida é este módulo, no
 * servidor — e a pessoa confirma ou troca cada casamento na tela.
 *
 * Regras, em ordem:
 * 1. Pessoa: o titular visível no print (ex.: "Olá, Tatiane") vence; senão vale
 *    a pessoa escolhida no envio; senão qualquer pessoa da família.
 * 2. Nome: palavras do banco/rótulo lidos contra o nome da conta (sem acento,
 *    sem palavras genéricas como "saldo" e "conta", com apelidos comuns:
 *    "Nu" → Nubank, "Refeição" → VR, "Alimentação" → VA, "Patrimônio" →
 *    Investimentos). Vence a conta mais coberta; empate é ambíguo.
 * 3. Sem nome: o tipo do saldo (caixa, benefício, investimento, cashback) — só
 *    se houver UMA conta desse tipo para a pessoa, e marcado como casamento fraco.
 * 4. Conta com várias linhas recebe as leituras na ordem; leitura excedente
 *    fica sem conta (duplicate_target) em vez de sobrescrever outra.
 *
 * Nada aqui descarta leitura: quem não casa volta com positionId null e flags.
 */

export type MatchCategory = "cash" | "benefit" | "investment" | "cashback";
export type ReadKind = MatchCategory | "other";

export type MatchPosition = {
  id: string;
  personId: string;
  personName: string;
  accountId: string | null;
  /** Nome exibido da conta (ou o rótulo da categoria quando a linha não tem conta). */
  accountName: string;
  category: MatchCategory;
};

export type MatchPerson = { id: string; name: string };

export type MatchInput = {
  institution: string;
  label: string | null;
  holder: string | null;
  kind: ReadKind;
};

export type MatchFlag = "no_match" | "ambiguous_match" | "weak_match" | "kind_mismatch" | "duplicate_target" | "holder_unmatched";

export type MatchResult = {
  positionId: string | null;
  reason: "name" | "category" | null;
  /** Linhas plausíveis quando não houve casamento único (para a tela sugerir primeiro). */
  candidatePositionIds: string[];
  /** Pessoa considerada na busca (titular do print ou a escolhida no envio). */
  personId: string | null;
  flags: MatchFlag[];
};

// Palavras que aparecem em qualquer tela de banco e não identificam conta.
const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "e",
  "em",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "no",
  "na",
  "meu",
  "minha",
  "meus",
  "minhas",
  "seu",
  "sua",
  "banco",
  "conta",
  "contas",
  "corrente",
  "saldo",
  "disponivel",
  "total",
  "atual",
  "valor",
  "app",
  "digital",
  "cartao",
  "vale",
  "beneficio",
  "pagamento",
  "sa",
  "ltda",
]);

// Apelidos frequentes em apps de banco e de benefícios → token canônico. As
// chaves já estão sem acento e sem o "s" final ("aplicações" → "aplicacoe").
const ALIASES: Record<string, string> = {
  nu: "nubank",
  nuconta: "nubank",
  refeicao: "vr",
  restaurante: "vr",
  alimentacao: "va",
  patrimonio: "investimento",
  aplicacao: "investimento",
  aplicacoe: "investimento",
  investido: "investimento",
  cef: "caixa",
  bb: "brasil",
};

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Palavras significativas de um nome (sem acento, plural simples, apelidos aplicados). */
export function nameTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const tokens = new Set<string>();
  for (const word of words(text)) {
    const stem = word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
    if (STOPWORDS.has(stem) || STOPWORDS.has(word)) continue;
    const canonical = ALIASES[stem] ?? ALIASES[word] ?? stem;
    if (canonical.length >= 2) tokens.add(canonical);
  }
  return [...tokens];
}

/**
 * Titular lido no print → pessoa da família, pelo primeiro nome. Devolve
 * `unmatched` quando havia um nome visível que não corresponde a ninguém (ou a
 * mais de uma pessoa), para a tela avisar em vez de adivinhar.
 */
export function resolveHolder(holder: string | null | undefined, people: MatchPerson[]): { personId: string | null; unmatched: boolean } {
  const holderWords = words(holder ?? "");
  if (holderWords.length === 0) return { personId: null, unmatched: false };
  const matches = people.filter((person) => {
    const first = words(person.name)[0];
    return first ? holderWords.includes(first) : false;
  });
  return matches.length === 1 ? { personId: matches[0].id, unmatched: false } : { personId: null, unmatched: true };
}

type AccountGroup = {
  key: string;
  category: MatchCategory;
  tokens: string[];
  /** Linhas da conta no rascunho, na ordem de exibição. */
  lines: MatchPosition[];
};

function groupAccounts(positions: MatchPosition[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  for (const position of positions) {
    const key = position.accountId ?? `${position.personId}:${position.category}:${position.accountName}`;
    const group = groups.get(key) ?? { key, category: position.category, tokens: nameTokens(position.accountName), lines: [] };
    group.lines.push(position);
    groups.set(key, group);
  }
  return [...groups.values()];
}

type Ranked = { group: AccountGroup; coverage: number; overlap: number; sameKind: number };

function compareRanked(a: Ranked, b: Ranked) {
  return b.coverage - a.coverage || b.overlap - a.overlap || b.sameKind - a.sameKind;
}

/**
 * Sugere uma linha do rascunho para cada leitura. As leituras são processadas
 * na ordem recebida (a ordem dos prints), e a primeira leitura de uma conta
 * fica com a primeira linha livre dela.
 */
export function matchBalanceReads(
  reads: MatchInput[],
  context: { positions: MatchPosition[]; people: MatchPerson[]; personHintId?: string | null },
): MatchResult[] {
  const hint = context.personHintId && context.people.some((person) => person.id === context.personHintId) ? context.personHintId : null;
  const allGroups = groupAccounts(context.positions);
  const taken = new Set<string>();

  return reads.map((read) => {
    const flags: MatchFlag[] = [];
    const holder = resolveHolder(read.holder, context.people);
    if (holder.unmatched) flags.push("holder_unmatched");
    const personId = holder.personId ?? hint;

    const groups = personId ? allGroups.filter((group) => group.lines[0].personId === personId) : allGroups;
    const readTokens = new Set(nameTokens(`${read.institution} ${read.label ?? ""}`));
    const firstFreeLine = (group: AccountGroup) => group.lines.find((line) => !taken.has(line.id)) ?? group.lines[0];

    let chosen: AccountGroup | null = null;
    let reason: MatchResult["reason"] = null;
    let kindMismatch = false;
    let ambiguous: AccountGroup[] = [];

    const ranked: Ranked[] = groups
      .map((group) => {
        const overlap = group.tokens.filter((token) => readTokens.has(token)).length;
        return {
          group,
          overlap,
          coverage: group.tokens.length ? overlap / group.tokens.length : 0,
          sameKind: group.category === read.kind ? 1 : 0,
        };
      })
      .filter((item) => item.overlap > 0)
      .sort(compareRanked);

    if (ranked.length > 0) {
      const best = ranked[0];
      const tied = ranked.filter((item) => compareRanked(item, best) === 0);
      if (tied.length === 1) {
        chosen = best.group;
        reason = "name";
        kindMismatch = read.kind !== "other" && best.group.category !== read.kind;
      } else {
        ambiguous = tied.map((item) => item.group);
      }
    } else if (read.kind !== "other") {
      const sameKind = groups.filter((group) => group.category === read.kind);
      if (sameKind.length === 1) {
        chosen = sameKind[0];
        reason = "category";
        flags.push("weak_match");
      } else if (sameKind.length > 1) {
        ambiguous = sameKind;
      }
    }

    if (chosen) {
      const line = chosen.lines.find((item) => !taken.has(item.id));
      if (line) {
        taken.add(line.id);
        // Tipo divergente só faz sentido quando há uma conta sugerida para conferir.
        if (kindMismatch) flags.push("kind_mismatch");
        return { positionId: line.id, reason, candidatePositionIds: [], personId, flags };
      }
      flags.push("duplicate_target");
      return { positionId: null, reason: null, candidatePositionIds: chosen.lines.map((item) => item.id), personId, flags };
    }

    if (ambiguous.length > 0) {
      flags.push("ambiguous_match");
      return { positionId: null, reason: null, candidatePositionIds: ambiguous.map((group) => firstFreeLine(group).id), personId, flags };
    }

    flags.push("no_match");
    return { positionId: null, reason: null, candidatePositionIds: [], personId, flags };
  });
}
