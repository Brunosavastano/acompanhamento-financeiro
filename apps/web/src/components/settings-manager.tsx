"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Pencil, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { Button, Input, Panel, Select } from "@/components/ui";

type PersonRole = "owner" | "spouse" | "dependent";
type AccountType = "cash" | "benefit" | "investment" | "cashback" | "other";
type Account = { id: string; personId: string; name: string; accountType: AccountType; isActive: boolean };
type Person = { id: string; name: string; role: PersonRole; accounts: Account[] };
type Household = { name: string; baseCurrency: string };
type PersonForm = { name: string; role: PersonRole };
type AccountForm = { personId: string; name: string; accountType: AccountType; isActive: boolean };

const roleLabels: Record<PersonRole, string> = {
  owner: "Titular",
  spouse: "Conjuge",
  dependent: "Dependente",
};

const accountTypeLabels: Record<AccountType, string> = {
  cash: "Caixa",
  benefit: "Beneficio",
  investment: "Investimento",
  cashback: "Cashback",
  other: "Outro",
};

export function SettingsManager({ household, initialPeople }: { household: Household; initialPeople: Person[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [personForm, setPersonForm] = useState<PersonForm>({ name: "", role: "dependent" });
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

  async function loadPeople() {
    const response = await fetch("/api/persons", { cache: "no-store" });
    if (!response.ok) throw new Error("Nao foi possivel carregar pessoas e contas.");
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
      if (!response.ok) throw await apiError(response, "Nao foi possivel criar a pessoa.");
      setPersonForm({ name: "", role: "dependent" });
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
      if (!response.ok) throw await apiError(response, "Nao foi possivel salvar a pessoa.");
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

  async function deletePerson(id: string) {
    setBusyKey(`person-${id}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/persons/${id}`, { method: "DELETE" });
      if (!response.ok) throw await apiError(response, "Nao foi possivel remover a pessoa.");
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
      if (!response.ok) throw await apiError(response, "Nao foi possivel criar a conta.");
      setAccountForm((current) => ({ ...current, name: "", accountType: "cash", isActive: true }));
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
      if (!response.ok) throw await apiError(response, "Nao foi possivel salvar a conta.");
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

  async function deleteAccount(id: string) {
    setBusyKey(`account-${id}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
      if (!response.ok) throw await apiError(response, "Nao foi possivel remover a conta.");
      await loadPeople();
      setFeedback({ kind: "success", text: "Conta removida." });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error, "Falha ao remover conta.") });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
      <div className="space-y-4">
        <Panel>
          <h2 className="text-base font-semibold text-white">{household.name}</h2>
          <p className="mt-2 text-sm text-slate-400">Moeda base: {household.baseCurrency}</p>
          <p className="mt-4 text-sm leading-6 text-slate-400">
            O MVP opera com uma familia unica e mantem household_id no schema para isolamento futuro.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
            <span className="rounded-md border border-line px-2 py-1">{people.length} pessoas</span>
            <span className="rounded-md border border-line px-2 py-1">{accounts.filter((account) => account.isActive).length} contas ativas</span>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-base font-semibold text-white">Nova pessoa</h2>
          <form onSubmit={createPerson} className="mt-4 space-y-3">
            <Input placeholder="Nome" value={personForm.name} onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })} className="w-full" />
            <RoleSelect value={personForm.role} onChange={(role) => setPersonForm({ ...personForm, role })} />
            <Button type="submit" disabled={busyKey === "create-person" || !personForm.name}>
              <Plus className="h-4 w-4" />
              {busyKey === "create-person" ? "Criando" : "Criar pessoa"}
            </Button>
          </form>
        </Panel>

        <Panel>
          <h2 className="text-base font-semibold text-white">Nova conta</h2>
          <form onSubmit={createAccount} className="mt-4 space-y-3">
            <PersonSelect people={people} value={accountForm.personId} onChange={(personId) => setAccountForm({ ...accountForm, personId })} />
            <Input placeholder="Nome da conta" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} className="w-full" />
            <AccountTypeSelect value={accountForm.accountType} onChange={(accountType) => setAccountForm({ ...accountForm, accountType })} />
            <Button type="submit" disabled={busyKey === "create-account" || !accountForm.personId || !accountForm.name}>
              <Plus className="h-4 w-4" />
              {busyKey === "create-account" ? "Criando" : "Criar conta"}
            </Button>
          </form>
          {feedback ? <Feedback kind={feedback.kind} text={feedback.text} /> : null}
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Pessoas</h2>
            <IconButton label="Atualizar cadastros" onClick={() => void loadPeople()}>
              <RefreshCw className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {people.map((person) => {
              const isEditing = editingPersonId === person.id && personEdit;
              return (
                <div key={person.id} className="rounded-md border border-line bg-ink p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <Input value={personEdit.name} onChange={(event) => setPersonEdit({ ...personEdit, name: event.target.value })} className="w-full" />
                      <RoleSelect value={personEdit.role} onChange={(role) => setPersonEdit({ ...personEdit, role })} />
                    </div>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-white">{person.name}</div>
                      <div className="text-xs text-slate-500">{roleLabels[person.role]}</div>
                    </>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {person.accounts.map((account) => (
                      <span key={account.id} className={account.isActive ? "rounded-md border border-line px-2 py-1 text-xs text-slate-400" : "rounded-md border border-line px-2 py-1 text-xs text-slate-600"}>
                        {account.name} - {accountTypeLabels[account.accountType]}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    {isEditing ? (
                      <>
                        <IconButton label="Salvar pessoa" disabled={busyKey === `person-${person.id}` || !personEdit.name} onClick={() => void savePerson(person.id)}>
                          <Save className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Cancelar edicao" onClick={() => { setEditingPersonId(null); setPersonEdit(null); }}>
                          <X className="h-4 w-4" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        <IconButton label="Editar pessoa" onClick={() => { setEditingPersonId(person.id); setPersonEdit({ name: person.name, role: person.role }); }}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Remover pessoa" danger disabled={busyKey === `person-${person.id}`} onClick={() => void deletePerson(person.id)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {people.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma pessoa cadastrada.</p> : null}
        </Panel>

        <Panel>
          <h2 className="text-base font-semibold text-white">Contas</h2>
          <div className="mt-4 space-y-3 md:hidden">
            {accounts.map((account) => {
              const isEditing = editingAccountId === account.id && accountEdit;
              return (
                <div key={account.id} className={account.isActive ? "rounded-md border border-line bg-ink p-3" : "rounded-md border border-line bg-ink p-3 opacity-60"}>
                  {isEditing ? (
                    <div className="space-y-2">
                      <Input value={accountEdit.name} onChange={(event) => setAccountEdit({ ...accountEdit, name: event.target.value })} className="w-full" />
                      <PersonSelect people={people} value={accountEdit.personId} onChange={(personId) => setAccountEdit({ ...accountEdit, personId })} />
                      <AccountTypeSelect value={accountEdit.accountType} onChange={(accountType) => setAccountEdit({ ...accountEdit, accountType })} />
                      <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={accountEdit.isActive} onChange={(event) => setAccountEdit({ ...accountEdit, isActive: event.target.checked })} />
                        Ativa
                      </label>
                      <div className="flex justify-end gap-2">
                        <IconButton label="Salvar conta no card" disabled={busyKey === `account-${account.id}` || !accountEdit.name || !accountEdit.personId} onClick={() => void saveAccount(account.id)}>
                          <Save className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Cancelar edicao da conta no card" onClick={() => { setEditingAccountId(null); setAccountEdit(null); }}>
                          <X className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{account.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{account.personName} - {accountTypeLabels[account.accountType]}</div>
                        </div>
                        <span className="rounded-md border border-line px-2 py-1 text-xs text-slate-400">{account.isActive ? "Ativa" : "Inativa"}</span>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <IconButton label="Editar conta no card" onClick={() => { setEditingAccountId(account.id); setAccountEdit({ personId: account.personId, name: account.name, accountType: account.accountType, isActive: account.isActive }); }}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton label="Remover conta no card" danger disabled={busyKey === `account-${account.id}`} onClick={() => void deleteAccount(account.id)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="py-2">Conta</th>
                  <th>Pessoa</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th className="text-right">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {accounts.map((account) => {
                  const isEditing = editingAccountId === account.id && accountEdit;
                  return (
                    <tr key={account.id} className={account.isActive ? undefined : "opacity-60"}>
                      <td className="py-2 text-white">
                        {isEditing ? <Input value={accountEdit.name} onChange={(event) => setAccountEdit({ ...accountEdit, name: event.target.value })} className="w-48" /> : account.name}
                      </td>
                      <td className="text-slate-400">
                        {isEditing ? <PersonSelect people={people} value={accountEdit.personId} onChange={(personId) => setAccountEdit({ ...accountEdit, personId })} className="w-40" /> : account.personName}
                      </td>
                      <td className="text-slate-400">
                        {isEditing ? <AccountTypeSelect value={accountEdit.accountType} onChange={(accountType) => setAccountEdit({ ...accountEdit, accountType })} className="w-40" /> : accountTypeLabels[account.accountType]}
                      </td>
                      <td className="text-slate-400">
                        {isEditing ? (
                          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
                            <input type="checkbox" checked={accountEdit.isActive} onChange={(event) => setAccountEdit({ ...accountEdit, isActive: event.target.checked })} />
                            Ativa
                          </label>
                        ) : account.isActive ? "Ativa" : "Inativa"}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <IconButton label="Salvar conta" disabled={busyKey === `account-${account.id}` || !accountEdit.name || !accountEdit.personId} onClick={() => void saveAccount(account.id)}>
                                <Save className="h-4 w-4" />
                              </IconButton>
                              <IconButton label="Cancelar edicao" onClick={() => { setEditingAccountId(null); setAccountEdit(null); }}>
                                <X className="h-4 w-4" />
                              </IconButton>
                            </>
                          ) : (
                            <>
                              <IconButton label="Editar conta" onClick={() => { setEditingAccountId(account.id); setAccountEdit({ personId: account.personId, name: account.name, accountType: account.accountType, isActive: account.isActive }); }}>
                                <Pencil className="h-4 w-4" />
                              </IconButton>
                              <IconButton label="Remover conta" danger disabled={busyKey === `account-${account.id}`} onClick={() => void deleteAccount(account.id)}>
                                <Trash2 className="h-4 w-4" />
                              </IconButton>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {accounts.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Nenhuma conta cadastrada.</p> : null}
        </Panel>
      </div>
    </div>
  );
}

function RoleSelect({ className, value, onChange }: { className?: string; value: PersonRole; onChange: (value: PersonRole) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as PersonRole)} className={className ?? "w-full"}>
      {Object.entries(roleLabels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}

function AccountTypeSelect({ className, value, onChange }: { className?: string; value: AccountType; onChange: (value: AccountType) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as AccountType)} className={className ?? "w-full"}>
      {Object.entries(accountTypeLabels).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}

function PersonSelect({ className, people, value, onChange }: { className?: string; people: Person[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} className={className ?? "w-full"}>
      <option value="">Selecione a pessoa</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </Select>
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
      className={
        danger
          ? "focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-400 hover:border-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          : "focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md border border-line text-slate-400 hover:border-cyan hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

function Feedback({ kind, text }: { kind: "success" | "error"; text: string }) {
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={kind === "success" ? "mt-4 flex items-center gap-2 text-sm text-green" : "mt-4 flex items-center gap-2 text-sm text-red-300"}>
      <Icon className="h-4 w-4" />
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
