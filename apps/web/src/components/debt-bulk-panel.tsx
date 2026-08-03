"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ImageUp, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { Input, Select } from "@/components/ui";

type Person = { id: string; name: string };

type Row = {
  key: number;
  paymentMonth: string; // "YYYY-MM" ou ""
  amount: string;
  fromPrint: boolean;
  note: string | null;
};

type ReadRow = {
  monthLabel: string;
  paymentMonth: string | null;
  currentInvoice: boolean;
  amount: string | null;
  flags: string[];
  note: string | null;
};

const flagNotes: Record<string, string> = {
  ambiguous_magnitude: "Confira a magnitude — o valor pode estar sem centavos no print.",
  unparseable: "Valor não reconhecido no print — preencha manualmente.",
  month_unresolved: "Mês não reconhecido no print — selecione manualmente.",
  before_base: "Parece fatura passada (mês anterior à base) — remova a linha ou ajuste o mês.",
  past_invoice: "O print marca esta fatura como fechada/paga — normalmente não deve ser lançada.",
};

let rowKey = 0;
function newRow(partial?: Partial<Row>): Row {
  rowKey += 1;
  return { key: rowKey, paymentMonth: "", amount: "", fromPrint: false, note: null, ...partial };
}

/**
 * Lançamento de vários meses de fatura de uma vez: grade manual, opcionalmente
 * pré-preenchida pela leitura de um print do app do banco. A leitura NUNCA
 * grava nada — só preenche a grade para revisão; salvar é o botão humano.
 * Salvar sempre substitui o valor do mês (o anterior fica na auditoria).
 */
export function DebtBulkPanel({
  people,
  period,
  aiReaderAvailable,
  onSaved,
}: {
  people: Person[];
  period: string;
  aiReaderAvailable: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [rows, setRows] = useState<Row[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openPanel() {
    setOpen(true);
    if (rows.length === 0) setRows([newRow({ paymentMonth: period })]);
    setFeedback(null);
  }

  async function readPrints(files: FileList | null) {
    if (!files || files.length === 0) return;
    setReading(true);
    setFeedback(null);
    setWarnings([]);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) formData.append("images", file);
      formData.append("baseMonth", period);
      const response = await fetch("/api/debts/statement-read", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível ler o print.");

      const readRows = (payload.rows ?? []) as ReadRow[];
      if (readRows.length === 0) {
        setFeedback({ kind: "error", text: "Nenhuma linha de fatura reconhecida no print." });
        return;
      }
      setRows(
        readRows.map((row) =>
          newRow({
            paymentMonth: row.paymentMonth ? row.paymentMonth.slice(0, 7) : "",
            amount: row.amount ?? "",
            fromPrint: true,
            note:
              [row.currentInvoice ? "Fatura atual no print." : null, ...row.flags.map((flag) => flagNotes[flag]), row.note]
                .filter(Boolean)
                .join(" ") || null,
          }),
        ),
      );
      setWarnings((payload.warnings ?? []) as string[]);
      setFeedback({
        kind: "success",
        text: `${readRows.length} ${readRows.length === 1 ? "mês lido" : "meses lidos"} do print. Confira e salve.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao ler o print." });
    } finally {
      setReading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  const validRows = rows.filter((row) => row.paymentMonth !== "" && row.amount !== "" && Number.isFinite(Number(row.amount)));
  const monthsSeen = new Set(validRows.map((row) => row.paymentMonth));
  const hasDuplicates = monthsSeen.size !== validRows.length;

  async function save() {
    if (validRows.length === 0 || hasDuplicates) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/debts/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personId,
          cardName: "Cartão principal",
          invoiceMonth: `${period}-01`,
          entries: validRows.map((row) => ({
            paymentMonth: `${row.paymentMonth}-01`,
            amount: Number(row.amount),
            description: row.fromPrint ? "Projeção lida de print" : null,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar os meses.");
      const total = Number(payload.replacedCount ?? 0) + Number(payload.createdCount ?? 0);
      setFeedback({ kind: "success", text: `${total} ${total === 1 ? "mês salvo" : "meses salvos"}.` });
      setRows([]);
      setWarnings([]);
      await onSaved();
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "Falha ao salvar os meses." });
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className="focus-ring mt-4 flex w-full items-center gap-3 rounded-[10px] border border-dashed border-edge px-4 py-3 text-left hover:border-gold"
      >
        <ImageUp className="h-[18px] w-[18px] shrink-0 text-gold" aria-hidden />
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-body">Vários meses de uma vez</span>
          <span className="block text-[11px] leading-[16px] text-faint">
            Preencha a grade manualmente ou envie um print das próximas faturas do app do banco.
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-[10px] border border-edge bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[13px] font-semibold text-snow">Vários meses de uma vez</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar lançamento em lote"
          className="focus-ring rounded-md p-1 text-faint hover:bg-elevated hover:text-snow"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-muted">
          Pessoa
          <Select value={personId} onChange={(event) => setPersonId(event.target.value)} className="mt-1.5 w-full bg-surface">
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!aiReaderAvailable || reading}
            title={aiReaderAvailable ? undefined : "Configure AI_FEATURES_ENABLED e AI_VISION_MODEL para ler prints."}
            className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg border border-edge px-3 py-2 text-xs font-semibold text-body hover:border-gold hover:text-snow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImageUp className="h-3.5 w-3.5" aria-hidden />}
            {reading ? "Lendo o print…" : "Ler de um print do banco"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(event) => void readPrints(event.target.files)}
          />
        </div>
      </div>
      {!aiReaderAvailable ? (
        <p className="mt-2 text-[10px] leading-[14px] text-faint">
          Leitor de prints indisponível: configure AI_FEATURES_ENABLED, AI_VISION_MODEL e a chave do provedor no servidor.
        </p>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-[8px] border border-gold/35 bg-gold/[0.06] px-3 py-2 text-[11px] leading-[16px] text-gold-light">
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="grid grid-cols-[130px_1fr_32px] items-center gap-2">
              <Input
                type="month"
                aria-label="Mês de vencimento"
                value={row.paymentMonth}
                min={period}
                onChange={(event) => updateRow(row.key, { paymentMonth: event.target.value })}
                className="w-full bg-surface tabular-nums"
              />
              <Input
                type="number"
                step="0.01"
                aria-label={`Valor de ${row.paymentMonth || "mês"}`}
                placeholder="Valor"
                value={row.amount}
                onChange={(event) => updateRow(row.key, { amount: event.target.value })}
                className="w-full bg-surface text-right tabular-nums"
              />
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
                aria-label="Remover linha"
                className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-faint hover:bg-elevated hover:text-negative-text"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            {row.note ? <p className="mt-1 text-[10px] leading-[14px] text-gold-light">{row.note}</p> : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRows((current) => [...current, newRow()])}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-dashed border-edge px-3 py-1.5 text-xs font-medium text-muted hover:border-gold hover:text-gold-light"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Adicionar linha
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || validRows.length === 0 || hasDuplicates || !personId}
          className="focus-ring ml-auto inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-xs font-bold text-sidebar hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
          Salvar {validRows.length} {validRows.length === 1 ? "mês" : "meses"}
        </button>
      </div>
      {hasDuplicates ? <p className="mt-2 text-[11px] text-negative-text">Há mais de uma linha para o mesmo mês — remova a duplicada.</p> : null}
      {feedback ? (
        <div className={clsx("mt-2.5 flex items-center gap-2 text-[12px]", feedback.kind === "success" ? "text-positive-text" : "text-negative-text")}>
          {feedback.kind === "success" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden />}
          <span>{feedback.text}</span>
        </div>
      ) : null}
    </div>
  );
}
