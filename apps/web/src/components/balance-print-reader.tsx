"use client";

import { useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, ImageUp, Loader2, X } from "lucide-react";
import { clsx } from "clsx";
import type { BalanceReadFlag, BalanceReadResult, BalanceReadRow } from "@finance/shared-types";
import { Select } from "@/components/ui";
import { currency } from "@/lib/format";

export type ReaderPosition = { id: string; personId: string; personName: string; label: string };

export type ReaderRow = BalanceReadRow & {
  key: string;
  /** Linha do rascunho escolhida pela pessoa ("" = não aplicar). */
  target: string;
  applied: boolean;
};

/** Leituras guardadas pelo assistente: sobrevivem à troca de passo até o rascunho mudar. */
export type PrintReadState = { rows: ReaderRow[]; warnings: string[] };
export const emptyPrintReadState: PrintReadState = { rows: [], warnings: [] };

/** Leituras com conta escolhida e valor lido que ainda não foram para os campos. */
export function pendingPrintRows(rows: ReaderRow[], positionIds: Set<string>) {
  return rows.filter((row) => !row.applied && row.target !== "" && row.amount !== null && positionIds.has(row.target));
}

let readBatch = 0;

const kindLabels: Record<BalanceReadRow["kind"], string> = {
  cash: "caixa",
  benefit: "benefício",
  investment: "investimento",
  cashback: "cashback",
  other: "outro",
};

// Prints grandes de celular passam fácil de 2 MB cada; a Vercel recusa corpos
// acima de ~4,5 MB. Reduzir para 2000 px no lado maior mantém o texto nítido
// para o modelo (que trabalha em resolução menor que essa) e cabe vários prints.
const MAX_SIDE = 2000;
const KEEP_BELOW_BYTES = 1_500_000;

async function shrinkForUpload(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= KEEP_BELOW_BYTES) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    // Se o navegador não conseguir redimensionar, envia o original (o servidor valida o tamanho).
    return file;
  }
}

function confidence(row: ReaderRow): { label: string; tone: "positive" | "gold" | "negative" } {
  if (row.amount === null || row.flags.includes("low_confidence")) return { label: "Confiança baixa", tone: "negative" };
  if (row.confidence < 0.85 || row.flags.includes("ambiguous_magnitude") || row.flags.includes("large_delta")) {
    return { label: "Confiança média", tone: "gold" };
  }
  return { label: "Confiança alta", tone: "positive" };
}

function rowNotes(row: ReaderRow, labelById: Map<string, string>): string[] {
  const notes: string[] = [];
  const candidates = row.candidatePositionIds.map((id) => labelById.get(id)).filter(Boolean);
  const byFlag: Record<BalanceReadFlag, () => string> = {
    unparseable: () => "Valor não reconhecido no print — preencha o campo à mão.",
    ambiguous_magnitude: () => "Confira a magnitude: o valor pode estar sem centavos no print.",
    low_confidence: () => "Leitura incerta — confira no print.",
    large_delta: () => `Muito diferente do último fechamento (${currency(Number(row.previousAmount))}) — confira.`,
    no_match: () => "Conta não reconhecida — escolha a conta ou deixe sem aplicar.",
    ambiguous_match: () => `Mais de uma conta possível${candidates.length ? `: ${candidates.join(" ou ")}` : ""} — escolha a certa.`,
    weak_match: () => "Conta sugerida só pelo tipo de saldo — confira.",
    kind_mismatch: () => `O print parece ${kindLabels[row.kind]}, mas a conta sugerida é de outro tipo — confira.`,
    duplicate_target: () =>
      `Pelo nome seria ${candidates.length ? candidates.join(" / ") : "uma conta"}, mas outra leitura já ficou com ela — escolha outra conta ou deixe sem aplicar.`,
    holder_unmatched: () => `Titular no print (${row.detectedHolder ?? "?"}) não é ninguém da família.`,
  };
  for (const flag of row.flags) notes.push(byFlag[flag]());
  if (row.note) notes.push(row.note);
  return notes;
}

function readTitle(row: ReaderRow) {
  return [row.detectedInstitution || "Banco não identificado", row.detectedLabel].filter(Boolean).join(" — ");
}

/**
 * Leitor de prints de saldos do passo 2 do fechamento. A leitura NUNCA grava:
 * ela devolve saldos com uma conta sugerida; a pessoa confirma ou troca cada
 * conta e, ao clicar em "Preencher", os valores só entram nos campos do
 * formulário. Gravar continua sendo o botão "Salvar e revisar" do assistente.
 */
export function BalancePrintReader({
  snapshotId,
  positions,
  people,
  amounts,
  available,
  disabled,
  state,
  onStateChange,
  onApply,
}: {
  snapshotId: string;
  positions: ReaderPosition[];
  people: Array<{ id: string; name: string }>;
  amounts: Record<string, string>;
  available: boolean;
  disabled: boolean;
  state: PrintReadState;
  onStateChange: (update: (current: PrintReadState) => PrintReadState) => void;
  onApply: (entries: Array<{ positionId: string; amount: string }>) => void;
}) {
  const { rows, warnings } = state;
  const [reading, setReading] = useState(false);
  const [personHint, setPersonHint] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const labelById = useMemo(() => new Map(positions.map((position) => [position.id, position.label])), [positions]);
  const groups = useMemo(() => {
    const byPerson = new Map<string, ReaderPosition[]>();
    for (const position of positions) byPerson.set(position.personName, [...(byPerson.get(position.personName) ?? []), position]);
    return [...byPerson.entries()];
  }, [positions]);

  const pending = pendingPrintRows(rows, new Set(labelById.keys()));
  const covered = new Set(rows.filter((row) => row.target !== "").map((row) => row.target));
  const withoutRead = positions.filter((position) => !covered.has(position.id));

  async function readPrints(files: FileList | null) {
    if (!files || files.length === 0) return;
    setReading(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) formData.append("images", await shrinkForUpload(file));
      if (personHint) formData.append("personId", personHint);
      const response = await fetch(`/api/monthly-snapshots/${snapshotId}/balance-read`, { method: "POST", body: formData });
      const payload = (await response.json().catch(() => null)) as (BalanceReadResult & { error?: string }) | null;
      if (!response.ok || !payload) {
        if (response.status === 413) throw new Error(payload?.error ?? "Os prints passaram do limite de envio. Envie menos prints por vez.");
        throw new Error(payload?.error ?? "Não foi possível ler os prints.");
      }

      readBatch += 1;
      const batch = readBatch;
      // Leituras se acumulam: dá para enviar os prints de cada pessoa em levas.
      const read = payload.reads.map((row, index) => ({
        ...row,
        key: `${batch}-${index}`,
        target: row.positionId ?? "",
        applied: false,
      }));
      onStateChange((current) => ({ rows: [...current.rows, ...read], warnings: [...current.warnings, ...payload.warnings] }));
      const suggested = read.filter((row) => row.target !== "").length;
      setFeedback(
        read.length === 0
          ? { kind: "error", text: "Nenhum saldo reconhecido nos prints." }
          : {
              kind: "success",
              text: `${read.length} ${read.length === 1 ? "saldo lido" : "saldos lidos"}, ${suggested} com conta sugerida. Confira as contas e clique em "Preencher".`,
            },
      );
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao ler os prints." });
    } finally {
      setReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function chooseTarget(key: string, target: string) {
    onStateChange((current) => ({ ...current, rows: current.rows.map((row) => (row.key === key ? { ...row, target } : row)) }));
    setFeedback(null);
  }

  function applyRows() {
    const byTarget = new Map<string, ReaderRow[]>();
    for (const row of pending) byTarget.set(row.target, [...(byTarget.get(row.target) ?? []), row]);
    const conflicts = [...byTarget.entries()].filter(([, list]) => list.length > 1).map(([target]) => labelById.get(target));
    if (conflicts.length > 0) {
      setFeedback({
        kind: "error",
        text: `Mais de uma leitura para ${conflicts.join(", ")}. Escolha outra conta para uma delas ou marque "Não aplicar".`,
      });
      return;
    }
    onApply(pending.map((row) => ({ positionId: row.target, amount: row.amount as string })));
    const keys = new Set(pending.map((row) => row.key));
    onStateChange((current) => ({ ...current, rows: current.rows.map((row) => (keys.has(row.key) ? { ...row, applied: true } : row)) }));
    setFeedback({
      kind: "success",
      text: `${pending.length} ${pending.length === 1 ? "campo preenchido" : "campos preenchidos"} com os prints. Confira os valores marcados "do print" e clique em "Salvar e revisar".`,
    });
  }

  function clearReads() {
    onStateChange(() => emptyPrintReadState);
    setFeedback(null);
  }

  if (!available) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-dashed border-edge bg-surface/40 p-4">
        <ImageUp className="h-5 w-5 shrink-0 text-faint" aria-hidden />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-body">
            Preencher com prints dos bancos
            <span className="rounded-full bg-elevated px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
              Indisponível
            </span>
          </div>
          <p className="mt-0.5 text-xs text-faint">
            O leitor de prints precisa da IA configurada no servidor (AI_FEATURES_ENABLED, AI_VISION_MODEL e a chave do provedor).
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-[14px] border border-edge bg-surface p-4" aria-label="Leitor de prints dos bancos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ImageUp className="mt-0.5 h-5 w-5 shrink-0 text-gold" aria-hidden />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-snow">Preencher com prints dos bancos</div>
            <p className="mt-0.5 text-xs leading-[18px] text-faint">
              Envie screenshots dos apps (até 6 por vez). O assistente lê os saldos e sugere a conta de cada um; nada é salvo
              até você conferir e clicar em &quot;Salvar e revisar&quot;.
            </p>
          </div>
        </div>
        {rows.length > 0 ? (
          <button
            type="button"
            onClick={clearReads}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-faint hover:bg-elevated hover:text-snow"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Limpar leituras
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2.5">
        <label className="text-xs font-semibold text-muted">
          De quem são os prints
          <Select
            value={personHint}
            onChange={(event) => setPersonHint(event.target.value)}
            disabled={reading}
            className="mt-1.5 block w-56 bg-surface-2"
          >
            <option value="">Detectar pelo print</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || reading}
          className="focus-ring inline-flex items-center gap-2 rounded-lg border border-edge bg-surface-2 px-3.5 py-2 text-xs font-semibold text-body hover:border-gold hover:text-snow disabled:cursor-not-allowed disabled:opacity-50"
        >
          {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImageUp className="h-3.5 w-3.5" aria-hidden />}
          {reading ? "Lendo os prints…" : rows.length > 0 ? "Enviar mais prints" : "Enviar prints"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          aria-label="Prints dos apps dos bancos"
          className="hidden"
          onChange={(event) => void readPrints(event.target.files)}
        />
      </div>

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-[8px] border border-gold/35 bg-gold/[0.06] px-3 py-2 text-[11px] leading-[16px] text-gold-light">
          {warnings.map((warning, index) => (
            <div key={`${index}-${warning}`}>{warning}</div>
          ))}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2" aria-label="Saldos lidos dos prints">
          {rows.map((row) => {
            const level = confidence(row);
            const notes = rowNotes(row, labelById);
            const title = readTitle(row);
            return (
              <li key={row.key} className={clsx("rounded-[10px] border p-3", row.applied ? "border-edge-soft bg-surface-2/50" : "border-edge bg-surface-2")}>
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <div className="text-[11px] text-faint">
                      {row.imageIndex ? `Print ${row.imageIndex} · ` : ""}
                      {title}
                      {row.detectedHolder ? ` · titular: ${row.detectedHolder}` : ""}
                    </div>
                    <div className="mt-0.5 break-words text-[12px] text-body">&ldquo;{row.excerpt || row.amountRaw}&rdquo;</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold tabular-nums text-snow">
                      {row.amount !== null ? currency(Number(row.amount)) : `Não lido (${row.amountRaw || "vazio"})`}
                    </div>
                    <span
                      title={`Confiança do modelo na leitura: ${Math.round(row.confidence * 100)}%`}
                      className={clsx(
                        "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        level.tone === "positive" && "bg-positive/[0.15] text-positive-text",
                        level.tone === "gold" && "bg-gold/[0.14] text-gold-light",
                        level.tone === "negative" && "bg-negative/[0.15] text-negative-text",
                      )}
                    >
                      {level.label}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {row.applied ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-positive-text">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Preenchido em {labelById.get(row.target) ?? "conta removida"}
                    </span>
                  ) : (
                    <Select
                      value={row.target}
                      onChange={(event) => chooseTarget(row.key, event.target.value)}
                      disabled={disabled || row.amount === null}
                      aria-label={`Conta para o saldo lido de ${title}`}
                      className="w-full min-w-0 bg-surface text-xs sm:w-72"
                    >
                      <option value="">{row.amount === null ? "Preencha direto no campo" : "Não aplicar"}</option>
                      {groups.map(([personName, list]) => (
                        <optgroup key={personName} label={personName}>
                          {list.map((position) => (
                            <option key={position.id} value={position.id}>
                              {position.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                  )}
                  {row.target && !row.applied ? (
                    <span className="text-[11px] tabular-nums text-faint">
                      campo agora: {amounts[row.target] !== undefined && amounts[row.target] !== "" ? currency(Number(amounts[row.target])) : "vazio"}
                      {row.previousAmount !== null && row.target === row.positionId ? ` · último fechamento: ${currency(Number(row.previousAmount))}` : ""}
                    </span>
                  ) : null}
                </div>

                {notes.length > 0 && !row.applied ? (
                  <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px] leading-[16px] text-gold-light">
                    {notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={applyRows}
            disabled={disabled || pending.length === 0}
            className="focus-ring inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-xs font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            {pending.length === 0 ? "Nada a preencher" : `Preencher ${pending.length} ${pending.length === 1 ? "campo" : "campos"}`}
          </button>
          {withoutRead.length > 0 ? (
            <span className="text-[11px] leading-[16px] text-faint">
              Sem print: {withoutRead.map((position) => position.label).join(", ")} — preencha à mão ou envie mais prints.
            </span>
          ) : null}
        </div>
      ) : null}

      {feedback ? (
        <div
          role="status"
          className={clsx("mt-2.5 flex items-start gap-2 text-[12px]", feedback.kind === "success" ? "text-positive-text" : "text-negative-text")}
        >
          {feedback.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span>{feedback.text}</span>
        </div>
      ) : null}
    </section>
  );
}
