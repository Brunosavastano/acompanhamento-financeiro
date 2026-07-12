"use client";

import Image from "next/image";
import { useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { Input, Select } from "@/components/ui";

type PersonRole = "owner" | "spouse" | "dependent";
type AccountType = "cash" | "benefit" | "investment" | "cashback" | "other";
type Account = { id: string; personId: string; name: string; accountType: AccountType; isActive: boolean };
type Person = { id: string; name: string; role: PersonRole; accounts: Account[] };
type Household = { name: string; baseCurrency: string };
type PersonForm = { name: string; role: PersonRole };
type AccountForm = { personId: string; name: string; accountType: AccountType; isActive: boolean };

const roleLabels: Record<PersonRole, string> = {
  owner: "Titular",
  spouse: "Cônjuge",
  dependent: "Dependente",
};

const accountTypeLabels: Record<AccountType, string> = {
  cash: "Caixa",
  benefit: "Benefício",
  investment: "Investimento",
  cashback: "Cashback",
  other: "Outro",
};

const accountTypeDots: Record<AccountType, string> = {
  cash: "bg-info",
  benefit: "bg-positive",
  investment: "bg-gold",
  cashback: "bg-info-text",
  other: "bg-steel",
};

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  const text = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return text.toUpperCase();
}

export function SettingsManager({
  household,
  initialPeople,
  dataSince,
}: {
  household: Household;
  initialPeople: Person[];
  dataSince: string | null;
}) {
  const [people, setPeople] = useState(initialPeople);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [personForm, setPersonForm] = useState<PersonForm>({ name: "", role: "dependent" });
  const [addingAccount, setAddingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    personId: initialPeople[0]?.id ?? "",
    name: "",
    accountType: "cash",
    isActive: true,
  });
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [personEdit, setPersonEdit] = useState<PersonForm | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accountEdit, setAccountEdit] = useState<AccountForm | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const accounts = people.flatMap((person) => person.accounts.map((account) => ({ ...account, personName: person.name })));
  const activeAccounts = accounts.filter((account) => account.isActive).length;

  async function loadPeople() {
    const response = await fetch("/api/persons", { cache: "no-store" });
    if (!response.ok) throw new Error("Não foi possível carregar pessoas e contas.");
    const data = (await response.json()) as Person[];
    setPeople(data);
    setAccountForm((current) => ({
      ...current,
      personId: current.personId || data[0]?.id || "",
    }));
  }

  async function createPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey("create-person");
    setFeedback(null);
    try {
      const response = await fetch("/api/persons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personForm),
      });
      if (!response.ok) throw await apiError(response, "Não foi possível criar a pessoa.");
      setPersonForm({ name: "", role: "dependent" });
      setAddingPerson(false);
      await loadPeople();
      setFeedback({ kind: "success", text: "Pessoa criada." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error, "Falha ao criar pessoa.") });
    } finally {
      setBusyKey(null);
    }
  }

  async function savePerson(id: string) {
    if (!personEdit) return;
    setBusyKey(`person-${id}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/persons/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(personEdit),
      });
      if (!response.ok) throw await apiError(response, "Não foi possível salvar a pessoa.");
      setEditingPersonId(null);
      setPersonEdit(null);
      await loadPeople();
      setFeedback({ kind: "success", text: "Pessoa atualizada." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error, "Falha ao salvar pessoa.") });
    } finally {
      setBusyKey(null);
    }
  }

  async function deletePerson(id: string, name: string) {
    if (!window.confirm(`Remover ${name}? As contas e o histórico associados podem impedir a remoção.`)) return;
    setBusyKey(`person-${id}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/persons/${id}`, { method: "DELETE" });
      if (!response.ok) throw await apiError(response, "Não foi possível remover a pessoa.");
      await loadPeople();
      setFeedback({ kind: "success", text: "Pessoa removida." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error, "Falha ao remover pessoa.") });
    } finally {
      setBusyKey(null);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyKey("create-account");
    setFeedback(null);
    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accountForm),
      });
      if (!response.ok) throw await apiError(response, "Não foi possível criar a conta.");
      setAccountForm((current) => ({ ...current, name: "", accountType: "cash", isActive: true }));
      setAddingAccount(false);
      await loadPeople();
      setFeedback({ kind: "success", text: "Conta criada." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error, "Falha ao criar conta.") });
    } finally {
      setBusyKey(null);
    }
  }

  async function saveAccount(id: string) {
    if (!accountEdit) return;
    setBusyKey(`account-${id}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(accountEdit),
      });
      if (!response.ok) throw await apiError(response, "Não foi possível salvar a conta.");
      setEditingAccountId(null);
      setAccountEdit(null);
      await loadPeople();
      setFeedback({ kind: "success", text: "Conta atualizada." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error, "Falha ao salvar conta.") });
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteAccount(id: string, name: string) {
    if (!window.confirm(`Remover a conta ${name}? Se ela tem histórico, prefira desativá-la.`)) return;
    setBusyKey(`account-${id}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!response.ok) throw await apiError(response, "Não foi possível remover a conta.");
      await loadPeople();
      setFeedback({ kind: "success", text: "Conta removida." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error, "Falha ao remover conta.") });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <section className="flex flex-wrap items-center gap-5 rounded-[14px] border border-edge bg-gradient-to-br from-[#101A30] to-surface p-6">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[14px] border border-gold/40 bg-gold/[0.08] p-2">
          <Image src="/savastano-logo.png" alt="Brasão da família Savastano" width={48} height={48} className="h-full w-full object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-normal text-snow">{household.name}</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            {people.length} {people.length === 1 ? "pessoa" : "pessoas"} · {activeAccounts} {activeAccounts === 1 ? "conta ativa" : "contas ativas"}
            {dataSince ? ` · dados desde ${dataSince}` : ""}
          </p>
        </div>
      </section>

      {feedback ? <Feedback kind={feedback.kind} text={feedback.text} className="mt-4" /> : null}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-normal text-snow">Pessoas</h2>
            {!addingPerson ? (
              <button
                type="button"
                onClick={() => {
                  setAddingPerson(true);
                  setEditingPersonId(null);
                  setPersonEdit(null);
                }}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-[7px] text-xs font-semibold text-body hover:border-gold hover:text-gold-light"
              >
                <Plus className="h-[13px] w-[13px]" aria-hidden />
                Nova pessoa
              </button>
            ) : null}
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {people.map((person) => {
              const isEditing = editingPersonId === person.id && personEdit;
              return (
                <div key={person.id} className="rounded-xl border border-edge-soft bg-surface-2 p-[18px]">
                  {isEditing ? (
                    <div className="flex flex-col gap-2.5">
                      <Input value={personEdit.name} onChange={(event) => setPersonEdit({ ...personEdit, name: event.target.value })} className="w-full bg-surface" aria-label="Nome da pessoa" />
                      <Select value={personEdit.role} onChange={(event) => setPersonEdit({ ...personEdit, role: event.target.value as PersonRole })} className="w-full bg-surface" aria-label="Papel">
                        {Object.entries(roleLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <div className="flex justify-end gap-2">
                        <SmallButton
                          gold
                          disabled={busyKey === `person-${person.id}` || !personEdit.name}
                          busy={busyKey === `person-${person.id}`}
                          onClick={() => void savePerson(person.id)}
                        >
                          Salvar
                        </SmallButton>
                        <SmallButton onClick={() => { setEditingPersonId(null); setPersonEdit(null); }}>Cancelar</SmallButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-edge bg-elevated text-[13px] font-semibold text-gold">
                          {initials(person.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-snow">{person.name}</div>
                          <div className="text-xs text-faint">
                            {roleLabels[person.role]} · {person.accounts.length} {person.accounts.length === 1 ? "conta" : "contas"}
                          </div>
                        </div>
                        <IconButton label={`Editar ${person.name}`} onClick={() => { setEditingPersonId(person.id); setPersonEdit({ name: person.name, role: person.role }); setAddingPerson(false); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                        <IconButton label={`Remover ${person.name}`} danger disabled={busyKey === `person-${person.id}`} onClick={() => void deletePerson(person.id, person.name)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                      {person.accounts.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {person.accounts.map((account) => (
                            <span
                              key={account.id}
                              className={clsx("rounded-full border border-edge px-2.5 py-1 text-[11px] text-muted", !account.isActive && "opacity-50")}
                            >
                              {account.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}

            {addingPerson ? (
              <form onSubmit={createPerson} className="rounded-xl border border-edge bg-surface-2 p-[18px]">
                <div className="flex flex-col gap-2.5">
                  <Input placeholder="Nome" value={personForm.name} onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })} className="w-full bg-surface" />
                  <Select value={personForm.role} onChange={(event) => setPersonForm({ ...personForm, role: event.target.value as PersonRole })} className="w-full bg-surface" aria-label="Papel">
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                  <div className="flex justify-end gap-2">
                    <SmallButton gold submit disabled={busyKey === "create-person" || !personForm.name} busy={busyKey === "create-person"}>
                      Criar pessoa
                    </SmallButton>
                    <SmallButton onClick={() => setAddingPerson(false)}>Cancelar</SmallButton>
                  </div>
                </div>
              </form>
            ) : null}
          </div>
        </section>

        <section className="min-w-0 rounded-[14px] border border-edge bg-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-normal text-snow">Contas</h2>
            {!addingAccount ? (
              <button
                type="button"
                onClick={() => {
                  setAddingAccount(true);
                  setEditingAccountId(null);
                  setAccountEdit(null);
                }}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-[7px] text-xs font-semibold text-body hover:border-gold hover:text-gold-light"
              >
                <Plus className="h-[13px] w-[13px]" aria-hidden />
                Nova conta
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-col">
            {accounts.map((account) => {
              const isEditing = editingAccountId === account.id && accountEdit;
              if (isEditing) {
                return (
                  <div key={account.id} className="my-2 rounded-[10px] border border-edge bg-surface-2 p-3">
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <Input value={accountEdit.name} onChange={(event) => setAccountEdit({ ...accountEdit, name: event.target.value })} className="w-full bg-surface" aria-label="Nome da conta" />
                      <Select value={accountEdit.personId} onChange={(event) => setAccountEdit({ ...accountEdit, personId: event.target.value })} className="w-full bg-surface" aria-label="Pessoa">
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={accountEdit.accountType}
                        onChange={(event) => setAccountEdit({ ...accountEdit, accountType: event.target.value as AccountType })}
                        className="w-full bg-surface"
                        aria-label="Tipo de conta"
                      >
                        {Object.entries(accountTypeLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <label className="inline-flex items-center gap-2 text-xs text-body">
                        <input
                          type="checkbox"
                          checked={accountEdit.isActive}
                          onChange={(event) => setAccountEdit({ ...accountEdit, isActive: event.target.checked })}
                          className="accent-[#C9A96E]"
                        />
                        Ativa nos fechamentos
                      </label>
                    </div>
                    <div className="mt-2.5 flex justify-end gap-2">
                      <SmallButton
                        gold
                        disabled={busyKey === `account-${account.id}` || !accountEdit.name || !accountEdit.personId}
                        busy={busyKey === `account-${account.id}`}
                        onClick={() => void saveAccount(account.id)}
                      >
                        Salvar
                      </SmallButton>
                      <SmallButton onClick={() => { setEditingAccountId(null); setAccountEdit(null); }}>Cancelar</SmallButton>
                    </div>
                  </div>
                );
              }
              return (
                <div key={account.id} className={clsx("flex items-center gap-3 border-b border-edge-hair py-3 last:border-b-0", !account.isActive && "opacity-55")}>
                  <span className={clsx("h-[9px] w-[9px] shrink-0 rounded-[3px]", accountTypeDots[account.accountType])} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-snow">{account.name}</div>
                    <div className="text-[11px] text-faint">
                      {account.personName} · {accountTypeLabels[account.accountType]}
                    </div>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                      account.isActive ? "bg-positive/[0.12] text-positive-text" : "bg-faint/[0.15] text-muted",
                    )}
                  >
                    {account.isActive ? "Ativa" : "Inativa"}
                  </span>
                  <IconButton
                    label={`Editar conta ${account.name}`}
                    onClick={() => {
                      setEditingAccountId(account.id);
                      setAccountEdit({ personId: account.personId, name: account.name, accountType: account.accountType, isActive: account.isActive });
                      setAddingAccount(false);
                    }}
                  >
                    <Pencil className="h-[13px] w-[13px]" />
                  </IconButton>
                  <IconButton label={`Remover conta ${account.name}`} danger disabled={busyKey === `account-${account.id}`} onClick={() => void deleteAccount(account.id, account.name)}>
                    <Trash2 className="h-[13px] w-[13px]" />
                  </IconButton>
                </div>
              );
            })}
          </div>

          {addingAccount ? (
            <form onSubmit={createAccount} className="mt-3 rounded-[10px] border border-edge bg-surface-2 p-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Input placeholder="Nome da conta" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} className="w-full bg-surface" />
                <Select value={accountForm.personId} onChange={(event) => setAccountForm({ ...accountForm, personId: event.target.value })} className="w-full bg-surface" aria-label="Pessoa">
                  <option value="">Selecione a pessoa</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={accountForm.accountType}
                  onChange={(event) => setAccountForm({ ...accountForm, accountType: event.target.value as AccountType })}
                  className="w-full bg-surface"
                  aria-label="Tipo de conta"
                >
                  {Object.entries(accountTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <div className="flex justify-end gap-2">
                  <SmallButton gold submit disabled={busyKey === "create-account" || !accountForm.personId || !accountForm.name} busy={busyKey === "create-account"}>
                    Criar conta
                  </SmallButton>
                  <SmallButton onClick={() => setAddingAccount(false)}>Cancelar</SmallButton>
                </div>
              </div>
            </form>
          ) : null}

          <p className="mt-3.5 text-[11px] leading-[17px] text-faint">
            Contas desativadas saem dos novos fechamentos, mas o histórico é preservado.
          </p>
        </section>
      </div>
    </div>
  );
}

function SmallButton({
  children,
  gold,
  submit,
  busy,
  disabled,
  onClick,
}: {
  children: ReactNode;
  gold?: boolean;
  submit?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={submit ? "submit" : "button"}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "focus-ring inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60",
        gold ? "bg-gold font-bold text-sidebar hover:bg-gold-light" : "border border-edge text-body hover:border-muted",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : gold ? <Save className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </button>
  );
}

function IconButton({ children, danger, disabled, label, onClick }: { children: ReactNode; danger?: boolean; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "focus-ring inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-faint disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "hover:bg-elevated hover:text-negative-text" : "hover:bg-elevated hover:text-gold-light",
      )}
    >
      {children}
    </button>
  );
}

function Feedback({ kind, text, className }: { kind: "success" | "error"; text: string; className?: string }) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={clsx("flex items-center gap-2 text-[13px]", kind === "success" ? "text-positive-text" : "text-negative-text", className)}>
      <Icon className="h-4 w-4" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

async function apiError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  return new Error(typeof data?.error === "string" ? data.error : fallback);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
