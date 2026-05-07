import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST as createSnapshot } from "@/app/api/monthly-snapshots/route";
import { DELETE as deleteSnapshot, PATCH as updateSnapshot } from "@/app/api/monthly-snapshots/[id]/route";
import { GET as previewSnapshot } from "@/app/api/monthly-snapshots/[id]/preview/route";
import { POST as closeSnapshot } from "@/app/api/monthly-snapshots/[id]/close/route";
import { POST as reviseSnapshot } from "@/app/api/monthly-snapshots/[id]/revise/route";
import { POST as createPosition } from "@/app/api/monthly-snapshots/[id]/positions/route";
import { DELETE as deletePosition, PUT as updatePosition } from "@/app/api/monthly-snapshots/[id]/positions/[positionId]/route";
import { POST as createDebt } from "@/app/api/debts/route";
import { DELETE as deleteDebt, PUT as updateDebt } from "@/app/api/debt-cashflows/[id]/route";
import { GET as debtSummary } from "@/app/api/debts/summary/route";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { GET as getBudget, POST as createBudget } from "@/app/api/budget/route";
import { DELETE as deleteBudget, PUT as updateBudget } from "@/app/api/budget-items/[id]/route";
import { GET as listGoals, POST as createGoal } from "@/app/api/goals/route";
import { DELETE as deleteGoal, PUT as updateGoal } from "@/app/api/goals/[id]/route";
import { POST as updateGoalProgress } from "@/app/api/goals/[id]/manual-progress/route";
import { GET as listPeople, POST as createPerson } from "@/app/api/persons/route";
import { DELETE as deletePerson, PUT as updatePerson } from "@/app/api/persons/[id]/route";
import { POST as createAccount } from "@/app/api/accounts/route";
import { DELETE as deleteAccount, PUT as updateAccount } from "@/app/api/accounts/[id]/route";
import { GET as listAuditLogs } from "@/app/api/audit-logs/route";
import { GET as exportBackup } from "@/app/api/backup/export/route";

const mockedAuth = vi.hoisted(() => ({
  householdId: "api-test-household",
  userId: null as string | null,
}));

vi.mock("@/lib/authz", () => ({
  getRequiredHouseholdId: async () => mockedAuth.householdId,
  getRequiredPageHouseholdId: async () => mockedAuth.householdId,
  getCurrentUserId: async () => mockedAuth.userId,
}));

const runDbTests = process.env.RUN_DB_TESTS === "true";

describe.skipIf(!runDbTests)("API route integration flows", () => {
  beforeAll(async () => {
    await deleteHouseholdsByPrefix("api-test-");
  });

  beforeEach(async () => {
    mockedAuth.householdId = `api-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await prisma.household.create({
      data: {
        id: mockedAuth.householdId,
        name: "API Test Household",
        persons: {
          create: [
            {
              id: `${mockedAuth.householdId}-bruno`,
              name: "Bruno",
              role: "owner",
              accounts: { create: [{ name: "Conta teste", accountType: "cash" }] },
            },
            {
              id: `${mockedAuth.householdId}-tatiane`,
              name: "Tatiane",
              role: "spouse",
              accounts: { create: [{ name: "Investimento teste", accountType: "investment" }] },
            },
          ],
        },
      },
    });
  });

  afterEach(async () => {
    await deleteTestHousehold(mockedAuth.householdId);
  });

  it("creates, previews, closes and revises a monthly snapshot", async () => {
    const createdResponse = await createSnapshot(jsonRequest({ periodMonth: "2035-01", selicAnnual: 0.12 }));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    expect(created.status).toBe("draft");
    const createdRate = await prisma.interestRate.findUnique({
      where: {
        householdId_periodMonth_rateType: {
          householdId: mockedAuth.householdId,
          periodMonth: new Date("2035-01-01T00:00:00.000Z"),
          rateType: "selic_annual",
        },
      },
    });
    expect(Number(createdRate?.annualRate)).toBe(0.12);
    expect(createdRate?.source).toBe("manual");

    const duplicateDraftResponse = await createSnapshot(jsonRequest({ periodMonth: "2035-01", selicAnnual: 0.12 }));
    expect(duplicateDraftResponse.status).toBe(409);
    await expect(duplicateDraftResponse.json()).resolves.toMatchObject({ error: expect.stringContaining("rascunho") });

    const snapshot = await prisma.monthlySnapshot.findUniqueOrThrow({
      where: { id: created.id },
      include: { positions: true },
    });
    expect(snapshot.positions).toHaveLength(2);

    const cashPosition = snapshot.positions.find((position) => position.category === "cash") ?? snapshot.positions[0];
    const extraPositionResponse = await createPosition(
      jsonRequest({
        personId: cashPosition.personId,
        accountId: cashPosition.accountId,
        category: cashPosition.category,
        amount: 250,
      }),
      routeParams({ id: snapshot.id }),
    );
    expect(extraPositionResponse.status).toBe(201);
    const extraPosition = await extraPositionResponse.json();

    const deleteExtraPositionResponse = await deletePosition(
      new Request("http://test.local", { method: "DELETE" }),
      routeParams({ id: snapshot.id, positionId: extraPosition.id }),
    );
    expect(deleteExtraPositionResponse.status).toBe(200);

    const draftReviseResponse = await reviseSnapshot(jsonRequest({ notes: "Nao deve revisar rascunho" }), routeParams({ id: snapshot.id }));
    expect(draftReviseResponse.status).toBe(409);

    for (const position of snapshot.positions) {
      const amount = position.category === "investment" ? 4000 : 1000;
      const response = await updatePosition(
        jsonRequest({
          personId: position.personId,
          accountId: position.accountId,
          category: position.category,
          amount,
        }),
        routeParams({ id: snapshot.id, positionId: position.id }),
      );
      expect(response.status).toBe(200);
    }

    const metadataResponse = await updateSnapshot(jsonRequest({ selicAnnual: 0.1, notes: "Notas do teste" }), routeParams({ id: snapshot.id }));
    expect(metadataResponse.status).toBe(200);
    const metadata = await metadataResponse.json();
    expect(metadata.notes).toBe("Notas do teste");
    const updatedRate = await prisma.interestRate.findUnique({
      where: {
        householdId_periodMonth_rateType: {
          householdId: mockedAuth.householdId,
          periodMonth: new Date("2035-01-01T00:00:00.000Z"),
          rateType: "selic_annual",
        },
      },
    });
    expect(Number(updatedRate?.annualRate)).toBe(0.1);

    await prisma.debtCashflow.create({
      data: {
        householdId: mockedAuth.householdId,
        personId: cashPosition.personId,
        cardName: "Cartao teste",
        invoiceMonth: new Date("2034-12-01T00:00:00.000Z"),
        paymentMonth: new Date("2035-01-01T00:00:00.000Z"),
        amount: 250,
        description: "Parcela de coorte anterior",
        source: "manual_matrix",
      },
    });
    const januaryDebtSummaryResponse = await debtSummary(new Request("http://test.local/api/debts/summary?period_month=2035-01"));
    expect(januaryDebtSummaryResponse.status).toBe(200);
    const januaryDebtSummary = await januaryDebtSummaryResponse.json();
    expect(januaryDebtSummary.nominalTotal).toBe(0);
    expect(januaryDebtSummary.monthlyInvoiceTotal).toBe(250);
    expect(januaryDebtSummary.byPerson[cashPosition.personId].monthlyInvoiceTotal).toBe(250);

    const previewResponse = await previewSnapshot(new Request("http://test.local"), routeParams({ id: snapshot.id }));
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.kpis.netWorth).toBe(5000);

    const closeResponse = await closeSnapshot(new Request("http://test.local", { method: "POST" }), routeParams({ id: snapshot.id }));
    expect(closeResponse.status).toBe(200);
    const closed = await closeResponse.json();
    expect(closed.snapshot.status).toBe("closed");

    const secondCloseResponse = await closeSnapshot(new Request("http://test.local", { method: "POST" }), routeParams({ id: snapshot.id }));
    expect(secondCloseResponse.status).toBe(409);

    const duplicateClosedResponse = await createSnapshot(jsonRequest({ periodMonth: "2035-01", selicAnnual: 0.12 }));
    expect(duplicateClosedResponse.status).toBe(409);
    await expect(duplicateClosedResponse.json()).resolves.toMatchObject({ error: expect.stringContaining("fechado") });

    const closedCreatePositionResponse = await createPosition(
      jsonRequest({
        personId: cashPosition.personId,
        accountId: cashPosition.accountId,
        category: cashPosition.category,
        amount: 100,
      }),
      routeParams({ id: snapshot.id }),
    );
    expect(closedCreatePositionResponse.status).toBe(409);

    const closedDeletePositionResponse = await deletePosition(
      new Request("http://test.local", { method: "DELETE" }),
      routeParams({ id: snapshot.id, positionId: cashPosition.id }),
    );
    expect(closedDeletePositionResponse.status).toBe(409);

    const closedMetadataResponse = await updateSnapshot(jsonRequest({ notes: "Nao deve alterar fechado" }), routeParams({ id: snapshot.id }));
    expect(closedMetadataResponse.status).toBe(409);

    const closedDeleteSnapshotResponse = await deleteSnapshot(new Request("http://test.local", { method: "DELETE" }), routeParams({ id: snapshot.id }));
    expect(closedDeleteSnapshotResponse.status).toBe(409);

    const metricGoalResponse = await createGoal(
      jsonRequest({
        title: "PL de teste",
        horizon: "short",
        metricKey: "pl_total",
        targetValue: 10000,
        targetDate: "2035-12",
        comparisonOperator: "greater_or_equal",
        manualCurrentValue: null,
      }),
    );
    expect(metricGoalResponse.status).toBe(201);

    await prisma.goal.create({
      data: {
        householdId: mockedAuth.householdId,
        title: "TOTAL GERAL:",
        horizon: "short",
        metricKey: "1",
        targetValueText: "Linha-resumo herdada",
        comparisonOperator: "manual",
      },
    });

    const dashboardResponse = await getDashboard(new Request("http://test.local/api/dashboard?period_month=2035-01"));
    expect(dashboardResponse.status).toBe(200);
    const dashboard = await dashboardResponse.json();
    const dashboardGoal = dashboard.closestGoals.find((goal: { title: string }) => goal.title === "PL de teste");
    expect(dashboardGoal.progressPct).toBe(0.5);
    expect(dashboardGoal.currentValue).toBe("5000");
    expect(dashboard.closestGoals.some((goal: { title: string }) => goal.title === "TOTAL GERAL:")).toBe(false);

    const goalsResponse = await listGoals(new Request("http://test.local/api/goals?period_month=2035-01"));
    expect(goalsResponse.status).toBe(200);
    const listedGoals = await goalsResponse.json();
    const listedGoal = listedGoals.find((goal: { title: string }) => goal.title === "PL de teste");
    expect(listedGoal.progressPct).toBe(0.5);
    expect(listedGoal.progressSource).toBe("calculated");
    expect(listedGoals.some((goal: { title: string }) => goal.title === "TOTAL GERAL:")).toBe(false);

    const reviseResponse = await reviseSnapshot(jsonRequest({ notes: "Teste de revisao" }), routeParams({ id: snapshot.id }));
    expect(reviseResponse.status).toBe(201);
    const revision = await reviseResponse.json();
    expect(revision.status).toBe("draft");
    expect(revision.revisionNumber).toBe(2);

    const original = await prisma.monthlySnapshot.findUniqueOrThrow({ where: { id: snapshot.id } });
    expect(original.status).toBe("revised");

    const revisedAgainResponse = await reviseSnapshot(jsonRequest({ notes: "Nao deve revisar revisado" }), routeParams({ id: snapshot.id }));
    expect(revisedAgainResponse.status).toBe(409);

    const futureDraftResponse = await createSnapshot(jsonRequest({ periodMonth: "2035-12", selicAnnual: 0.12 }));
    expect(futureDraftResponse.status).toBe(201);
    const futureDraft = await futureDraftResponse.json();
    const deleteDraftResponse = await deleteSnapshot(new Request("http://test.local", { method: "DELETE" }), routeParams({ id: futureDraft.id }));
    expect(deleteDraftResponse.status).toBe(200);
    await expect(prisma.monthlySnapshot.findUnique({ where: { id: futureDraft.id } })).resolves.toBeNull();

    const defaultDashboardResponse = await getDashboard(new Request("http://test.local/api/dashboard"));
    expect(defaultDashboardResponse.status).toBe(200);
    const defaultDashboard = await defaultDashboardResponse.json();
    expect(defaultDashboard.periodMonth.slice(0, 7)).toBe("2035-01");
    expect(defaultDashboard.availablePeriods.every((period: { status: string }) => period.status !== "draft")).toBe(true);
  });

  it("creates debt, budget and goal records through API routes", async () => {
    const bruno = await prisma.person.findFirstOrThrow({ where: { householdId: mockedAuth.householdId, name: "Bruno" } });

    const snapshotResponse = await createSnapshot(jsonRequest({ periodMonth: "2035-02", selicAnnual: 0.12 }));
    expect(snapshotResponse.status).toBe(201);

    const invalidDebtResponse = await createDebt(
      jsonRequest({
        personId: bruno.id,
        cardName: "Cartao principal",
        invoiceMonth: "2035-02",
        paymentMonth: "2035-01",
        amount: 1000,
        description: "Vencimento invalido",
      }),
    );
    expect(invalidDebtResponse.status).toBe(400);
    const invalidDebt = await invalidDebtResponse.json();
    expect(invalidDebt.error).toContain("vencimento");

    const debtResponse = await createDebt(
      jsonRequest({
        personId: bruno.id,
        cardName: "Cartao principal",
        invoiceMonth: "2035-02",
        paymentMonth: "2035-03",
        amount: 1000,
        description: "Teste API",
      }),
    );
    expect(debtResponse.status).toBe(201);

    const debtSummaryResponse = await debtSummary(new Request("http://test.local/api/debts/summary?period_month=2035-02"));
    expect(debtSummaryResponse.status).toBe(200);
    const debt = await debtSummaryResponse.json();
    expect(debt.nominalTotal).toBe(1000);

    const budgetResponse = await createBudget(
      jsonRequest({
        personId: bruno.id,
        name: "Receita teste",
        kind: "income",
        amountMonthly: 5000,
        recurrence: "monthly",
        startMonth: "2035-02",
        isActive: true,
      }),
    );
    expect(budgetResponse.status).toBe(201);

    const oneOffBudgetResponse = await createBudget(
      jsonRequest({
        personId: bruno.id,
        name: "Despesa pontual",
        kind: "variable_expense",
        amountMonthly: 1200,
        recurrence: "one_off",
        startMonth: "2035-02",
        isActive: true,
      }),
    );
    expect(oneOffBudgetResponse.status).toBe(201);

    const februaryBudgetResponse = await getBudget(new Request("http://test.local/api/budget?period_month=2035-02"));
    expect(februaryBudgetResponse.status).toBe(200);
    const februaryBudget = await februaryBudgetResponse.json();
    expect(februaryBudget.metrics.variableExpenseTotal).toBe(1200);
    expect(februaryBudget.metrics.cardMovingAverageExpense).toBe(0);

    const marchBudgetResponse = await getBudget(new Request("http://test.local/api/budget?period_month=2035-03"));
    expect(marchBudgetResponse.status).toBe(200);
    const marchBudget = await marchBudgetResponse.json();
    expect(marchBudget.metrics.budgetItemVariableExpenseTotal).toBe(0);
    expect(marchBudget.metrics.cardMovingAverageExpense).toBe(1000);
    expect(marchBudget.metrics.cardMovingAverageAppliedExpense).toBe(1000);
    expect(marchBudget.metrics.cardMovingAverageApplied).toBe(true);
    expect(marchBudget.metrics.cardMovingAverageMonths).toBe(1);
    expect(marchBudget.metrics.variableExpenseTotal).toBe(1000);

    const goalResponse = await createGoal(
      jsonRequest({
        title: "Meta teste",
        horizon: "short",
        metricKey: "manual",
        targetValue: "Concluir",
        targetDate: "2035-12",
        comparisonOperator: "manual",
        manualCurrentValue: "Em andamento",
      }),
    );
    expect(goalResponse.status).toBe(201);
    const goal = await goalResponse.json();

    const progressResponse = await updateGoalProgress(
      jsonRequest({ periodMonth: "2035-02", currentValue: "Concluido", progressPct: 1, status: "achieved" }),
      routeParams({ id: goal.id }),
    );
    expect(progressResponse.status).toBe(200);
    const progress = await progressResponse.json();
    expect(progress.status).toBe("achieved");

    await prisma.interestRate.upsert({
      where: {
        householdId_periodMonth_rateType: {
          householdId: mockedAuth.householdId,
          periodMonth: new Date("2035-02-01T00:00:00.000Z"),
          rateType: "selic_annual",
        },
      },
      create: {
        householdId: mockedAuth.householdId,
        periodMonth: new Date("2035-02-01T00:00:00.000Z"),
        rateType: "selic_annual",
        annualRate: 0.12,
        source: "manual",
      },
      update: { annualRate: 0.12, source: "manual" },
    });
    const foreignHouseholdId = `${mockedAuth.householdId}-foreign`;
    await prisma.household.create({ data: { id: foreignHouseholdId, name: "Foreign Household" } });
    await prisma.interestRate.create({
      data: {
        householdId: foreignHouseholdId,
        periodMonth: new Date("2035-02-01T00:00:00.000Z"),
        rateType: "selic_annual",
        annualRate: 0.99,
        source: "manual",
      },
    });

    await prisma.goal.create({
      data: {
        householdId: mockedAuth.householdId,
        title: "R$ 500 mil",
        horizon: "short",
        metricKey: "500000",
        targetValueText: "Linha de projecao herdada",
        comparisonOperator: "manual",
      },
    });

    const auditResponse = await listAuditLogs(new Request("http://test.local/api/audit-logs?take=50"));
    expect(auditResponse.status).toBe(200);
    const auditLogs = await auditResponse.json();
    expect(auditLogs.some((log: { entityType: string; action: string }) => log.entityType === "debt_cashflow" && log.action === "create")).toBe(true);
    expect(auditLogs.some((log: { entityType: string; action: string }) => log.entityType === "goal_progress_snapshot" && log.action === "manual-progress")).toBe(true);

    const backupResponse = await exportBackup(new Request("http://test.local/api/backup/export"));
    expect(backupResponse.status).toBe(200);
    const backup = await backupResponse.json();
    expect(backup.auditLogs.length).toBeGreaterThan(0);
    expect(backup.debtCashflows).toHaveLength(1);
    expect(backup.interestRates).toHaveLength(1);
    expect(Number(backup.interestRates[0].annualRate)).toBe(0.12);
    expect(backup.goals.some((row: { title: string }) => row.title === "R$ 500 mil")).toBe(false);
    expect(Array.isArray(backup.importJobs)).toBe(true);

    const csvResponse = await exportBackup(new Request("http://test.local/api/backup/export?format=csv&dataset=debtCashflows"));
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.headers.get("content-type")).toContain("text/csv");
    const csv = await csvResponse.text();
    expect(csv).toContain("Teste API");
    expect(csv).toContain("amount");

    await deleteTestHousehold(foreignHouseholdId);
  });

  it("manages people and accounts through settings API routes", async () => {
    const initialPeopleResponse = await listPeople();
    expect(initialPeopleResponse.status).toBe(200);
    const initialPeople = await initialPeopleResponse.json();
    expect(initialPeople).toHaveLength(2);

    const personResponse = await createPerson(jsonRequest({ name: "Dependente API", role: "dependent" }));
    expect(personResponse.status).toBe(201);
    const person = await personResponse.json();
    expect(person.accounts).toHaveLength(0);

    const accountResponse = await createAccount(
      jsonRequest({
        personId: person.id,
        name: "Conta dependente",
        accountType: "cash",
        isActive: true,
      }),
    );
    expect(accountResponse.status).toBe(201);
    const account = await accountResponse.json();
    expect(account.personId).toBe(person.id);

    const accountUpdateResponse = await updateAccount(
      jsonRequest({
        personId: person.id,
        name: "Conta dependente editada",
        accountType: "investment",
        isActive: false,
      }),
      routeParams({ id: account.id }),
    );
    expect(accountUpdateResponse.status).toBe(200);
    const updatedAccount = await accountUpdateResponse.json();
    expect(updatedAccount.isActive).toBe(false);
    expect(updatedAccount.accountType).toBe("investment");

    const personUpdateResponse = await updatePerson(
      jsonRequest({ name: "Dependente editado", role: "dependent" }),
      routeParams({ id: person.id }),
    );
    expect(personUpdateResponse.status).toBe(200);
    const updatedPerson = await personUpdateResponse.json();
    expect(updatedPerson.name).toBe("Dependente editado");

    const accountDeleteResponse = await deleteAccount(new Request("http://test.local", { method: "DELETE" }), routeParams({ id: account.id }));
    expect(accountDeleteResponse.status).toBe(200);

    const personDeleteResponse = await deletePerson(new Request("http://test.local", { method: "DELETE" }), routeParams({ id: person.id }));
    expect(personDeleteResponse.status).toBe(200);
  });

  it("updates and deletes debt, budget and goal records through API routes", async () => {
    const bruno = await prisma.person.findFirstOrThrow({ where: { householdId: mockedAuth.householdId, name: "Bruno" } });

    const debtResponse = await createDebt(
      jsonRequest({
        personId: bruno.id,
        cardName: "Cartao teste",
        invoiceMonth: "2035-04",
        paymentMonth: "2035-05",
        amount: 900,
        description: "Parcela inicial",
      }),
    );
    expect(debtResponse.status).toBe(201);
    const debt = await debtResponse.json();

    const debtUpdateResponse = await updateDebt(
      jsonRequest({
        personId: bruno.id,
        cardName: "Cartao teste editado",
        invoiceMonth: "2035-04",
        paymentMonth: "2035-06",
        amount: 1250,
        description: "Parcela editada",
      }),
      routeParams({ id: debt.id }),
    );
    expect(debtUpdateResponse.status).toBe(200);
    const updatedDebt = await debtUpdateResponse.json();
    expect(Number(updatedDebt.amount)).toBe(1250);
    expect(updatedDebt.source).toBe("adjustment");

    const invalidDebtUpdateResponse = await updateDebt(
      jsonRequest({
        personId: bruno.id,
        cardName: "Cartao teste editado",
        invoiceMonth: "2035-04",
        paymentMonth: "2035-03",
        amount: 1300,
        description: "Parcela invalida",
      }),
      routeParams({ id: debt.id }),
    );
    expect(invalidDebtUpdateResponse.status).toBe(400);

    const budgetResponse = await createBudget(
      jsonRequest({
        personId: bruno.id,
        name: "Despesa teste",
        kind: "fixed_expense",
        amountMonthly: 700,
        recurrence: "monthly",
        startMonth: "2035-04",
        isActive: true,
      }),
    );
    expect(budgetResponse.status).toBe(201);
    const budget = await budgetResponse.json();

    const budgetUpdateResponse = await updateBudget(
      jsonRequest({
        personId: bruno.id,
        name: "Despesa teste editada",
        kind: "variable_expense",
        amountMonthly: 880,
        recurrence: "monthly",
        startMonth: "2035-04",
        endMonth: null,
        isActive: false,
      }),
      routeParams({ id: budget.id }),
    );
    expect(budgetUpdateResponse.status).toBe(200);
    const updatedBudget = await budgetUpdateResponse.json();
    expect(updatedBudget.name).toBe("Despesa teste editada");
    expect(updatedBudget.isActive).toBe(false);

    const goalResponse = await createGoal(
      jsonRequest({
        title: "Meta editavel",
        horizon: "medium",
        metricKey: "pl_total",
        targetValue: 100000,
        targetDate: "2035-12",
        comparisonOperator: "greater_or_equal",
        manualCurrentValue: null,
      }),
    );
    expect(goalResponse.status).toBe(201);
    const goal = await goalResponse.json();

    const goalUpdateResponse = await updateGoal(
      jsonRequest({
        title: "Meta editada",
        horizon: "long",
        metricKey: "pl_total",
        targetValue: 150000,
        targetDate: "2036-12",
        comparisonOperator: "greater_or_equal",
        riskCapValue: null,
        manualCurrentValue: null,
        notes: "Atualizada pelo teste",
      }),
      routeParams({ id: goal.id }),
    );
    expect(goalUpdateResponse.status).toBe(200);
    const updatedGoal = await goalUpdateResponse.json();
    expect(updatedGoal.title).toBe("Meta editada");
    expect(Number(updatedGoal.targetValueDecimal)).toBe(150000);

    expect((await deleteGoal(new Request("http://test.local", { method: "DELETE" }), routeParams({ id: goal.id }))).status).toBe(200);
    expect((await deleteBudget(new Request("http://test.local", { method: "DELETE" }), routeParams({ id: budget.id }))).status).toBe(200);
    expect((await deleteDebt(new Request("http://test.local", { method: "DELETE" }), routeParams({ id: debt.id }))).status).toBe(200);

    await expect(prisma.goal.findUnique({ where: { id: goal.id } })).resolves.toBeNull();
    await expect(prisma.budgetItem.findUnique({ where: { id: budget.id } })).resolves.toBeNull();
    await expect(prisma.debtCashflow.findUnique({ where: { id: debt.id } })).resolves.toBeNull();
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://test.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}

async function deleteHouseholdsByPrefix(prefix: string) {
  const households = await prisma.household.findMany({
    where: { id: { startsWith: prefix } },
    select: { id: true },
  });
  for (const household of households) {
    await deleteTestHousehold(household.id);
  }
}

async function deleteTestHousehold(householdId: string) {
  await prisma.goalProgressSnapshot.deleteMany({ where: { goal: { householdId } } });
  await prisma.goal.deleteMany({ where: { householdId } });
  await prisma.interestRate.deleteMany({ where: { householdId } });
  await prisma.budgetItem.deleteMany({ where: { householdId } });
  await prisma.debtCashflow.deleteMany({ where: { householdId } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityId: householdId },
        { entityId: { startsWith: householdId } },
      ],
    },
  });
  await prisma.importReconciliationRow.deleteMany({ where: { importJob: { householdId } } });
  await prisma.importJob.deleteMany({ where: { householdId } });
  await prisma.monthlySnapshot.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { person: { householdId } } });
  await prisma.person.deleteMany({ where: { householdId } });
  await prisma.user.deleteMany({ where: { householdId } });
  await prisma.household.deleteMany({ where: { id: householdId } });
}
