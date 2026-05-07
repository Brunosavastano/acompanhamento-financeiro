import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

loadDotEnv();

const prisma = new PrismaClient();
const password = "admin123";
const testRunId = `e2e-app-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = `${testRunId}@example.com`;
const workspaceWorkbookPath = path.resolve(process.cwd(), "../../Plan_Fin_melhorada_claudeV2.xlsx");
const workbookPath = fs.existsSync(workspaceWorkbookPath) ? workspaceWorkbookPath : process.env.DEFAULT_EXCEL_PATH ?? workspaceWorkbookPath;

test.describe.serial("private finance app", () => {
  test.beforeAll(async () => {
    await deleteHouseholdsByPrefix("e2e-app-");
    await createHouseholdFixture(testRunId, email, password);
  });

  test.afterAll(async () => {
    await deleteHousehold(testRunId);
    await prisma.$disconnect();
  });

  test("logs in, imports the workbook, loads dashboard and exports backup", async ({ page }) => {
    test.skip(!fs.existsSync(workbookPath), `Workbook not found: ${workbookPath}`);

    await login(page);
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: "Relatórios" })).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles(workbookPath);
    await page.getByRole("button", { name: "Importar upload" }).click();
    await expect(page.getByText(/Importação concluída:/)).toBeVisible({ timeout: 60_000 });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("R$ 275.223,18")).toBeVisible();

    const backup = await page.evaluate(async () => {
      const response = await fetch("/api/backup/export");
      return response.json();
    });
    expect(backup.household.id).toBe(testRunId);
    expect(backup.snapshots.length).toBeGreaterThanOrEqual(14);
    expect(backup.goals).toHaveLength(20);
    expect(backup.goals.some((goal: { title: string }) => goal.title === "TOTAL GERAL:" || goal.title === "MARCO")).toBe(false);
  });

  test("creates and closes a monthly snapshot through the wizard", async ({ page }) => {
    await login(page);
    await page.goto("/fechamento");
    await expect(page.getByRole("heading", { name: "Fechamento mensal" })).toBeVisible();

    await page.getByLabel("Mês").fill("2098-02");
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page.getByText("Rascunho criado.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Adicionar posição manual")).toBeVisible();

    await page.getByPlaceholder("Valor").fill("123.45");
    await page.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Posição adicionada ao rascunho.")).toBeVisible({ timeout: 30_000 });

    await page.locator('button[title="Remover posição"]').last().click();
    await expect(page.getByText("Posição removida do rascunho.")).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Bruno - Nubank").fill("10000");
    await page.getByLabel("Bruno - Investimentos").fill("30000");
    await page.getByLabel("Tatiane - Caixa").fill("5000");
    await page.getByLabel("Tatiane - Investimentos").fill("15000");

    await page.getByRole("button", { name: "Salvar e calcular" }).click();
    await expect(page.getByText("Saldos salvos e prévia recalculada.")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Fechar mês" }).click();
    await expect(page.getByText("Mês fechado com sucesso.")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Trocar mês" }).click();
    await page.getByLabel("Mês").fill("2098-04");
    await page.getByRole("button", { name: "Criar rascunho" }).click();
    await expect(page.getByText("Rascunho criado.")).toBeVisible({ timeout: 30_000 });
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Excluir rascunho" }).click();
    await expect(page.getByText("Rascunho excluído.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Crie ou selecione um rascunho")).toBeVisible();
  });

  test("updates a debt cashflow and confirms it is present in backup", async ({ page }) => {
    await login(page);
    await page.goto("/dividas");
    await expect(page.getByRole("heading", { name: "Dívidas" })).toBeVisible();

    const form = page.locator("form").first();
    await form.locator('input[type="month"]').fill("2098-03");
    await form.getByPlaceholder("Valor").fill("1000");
    await form.getByPlaceholder("Descrição").fill("Dívida e2e");
    await form.getByRole("button", { name: "Adicionar" }).click();
    await expect(page.getByText("Parcela adicionada.")).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: "Dívida e2e" });
    await row.getByLabel("Editar parcela").click();
    await page.locator('tbody input[type="number"]').fill("1250");
    await page.getByLabel("Salvar parcela").click();
    await expect(page.getByText("Parcela atualizada.")).toBeVisible();

    const backup = await page.evaluate(async () => {
      const response = await fetch("/api/backup/export");
      return response.json();
    });
    expect(backup.debtCashflows.some((flow: { description: string | null; amount: string }) => flow.description === "Dívida e2e" && Number(flow.amount) === 1250)).toBe(true);
  });
});

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Bem-vindo, Bruno Savastano")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
}

async function createHouseholdFixture(householdId: string, userEmail: string, userPassword: string) {
  await prisma.household.create({
    data: {
      id: householdId,
      name: "E2E Household",
      persons: {
        create: [
          {
            id: `${householdId}-bruno`,
            name: "Bruno",
            role: "owner",
            accounts: {
              create: [
                { name: "Nubank", accountType: "cash" },
                { name: "VR", accountType: "benefit" },
                { name: "VA", accountType: "benefit" },
                { name: "Investimentos", accountType: "investment" },
                { name: "Cashback", accountType: "cashback" },
              ],
            },
          },
          {
            id: `${householdId}-tatiane`,
            name: "Tatiane",
            role: "spouse",
            accounts: {
              create: [
                { name: "Caixa", accountType: "cash" },
                { name: "Investimentos", accountType: "investment" },
              ],
            },
          },
        ],
      },
      users: {
        create: {
          email: userEmail,
          name: "E2E Bruno",
          passwordHash: await bcrypt.hash(userPassword, 10),
        },
      },
    },
  });
}

async function deleteHouseholdsByPrefix(prefix: string) {
  const households = await prisma.household.findMany({
    where: { id: { startsWith: prefix } },
    select: { id: true },
  });
  for (const household of households) {
    await deleteHousehold(household.id);
  }
}

async function deleteHousehold(householdId: string) {
  const users = await prisma.user.findMany({ where: { householdId }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        ...(userIds.length ? [{ userId: { in: userIds } }] : []),
        { entityId: householdId },
        { entityId: { startsWith: householdId } },
      ],
    },
  });
  await prisma.goalProgressSnapshot.deleteMany({ where: { goal: { householdId } } });
  await prisma.goal.deleteMany({ where: { householdId } });
  await prisma.interestRate.deleteMany({ where: { householdId } });
  await prisma.budgetItem.deleteMany({ where: { householdId } });
  await prisma.debtCashflow.deleteMany({ where: { householdId } });
  await prisma.importReconciliationRow.deleteMany({ where: { importJob: { householdId } } });
  await prisma.importJob.deleteMany({ where: { householdId } });
  await prisma.monthlySnapshot.deleteMany({ where: { householdId } });
  await prisma.account.deleteMany({ where: { person: { householdId } } });
  await prisma.person.deleteMany({ where: { householdId } });
  await prisma.user.deleteMany({ where: { householdId } });
  await prisma.household.deleteMany({ where: { id: householdId } });
}

function loadDotEnv() {
  for (const envPath of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "apps/web/.env")]) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      process.env[key] ??= value;
    }
  }
}
