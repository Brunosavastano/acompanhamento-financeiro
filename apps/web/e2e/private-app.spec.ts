import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { startMockVisionProvider } from "./mock-vision-provider";

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

  test("logs in, imports the workbook, loads dashboard and exports backup and spreadsheet", async ({ page }) => {
    test.skip(!fs.existsSync(workbookPath), `Workbook not found: ${workbookPath}`);

    await login(page);
    await page.goto("/relatorios");
    await expect(page.getByRole("heading", { name: "Dados e relatórios" })).toBeVisible();

    // O upload é um dropzone: o input escondido dispara a importação no onChange,
    // com um window.confirm antes de substituir a linha de base.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.locator('input[type="file"]').setInputFiles(workbookPath);
    await expect(page.getByText(/Importação concluída:/)).toBeVisible({ timeout: 60_000 });

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByText("R$ 275.223,18").first()).toBeVisible();

    // Evolução por pessoa (com a evolução de cada conta) e dívidas ao longo do tempo.
    const explorer = page.locator("section", { has: page.getByRole("heading", { name: "Evolução", exact: true }) });
    await expect(explorer.getByRole("group", { name: "Séries do gráfico" })).toBeVisible();
    await explorer.getByRole("button", { name: "Tatiane", exact: true }).click();
    await expect(explorer.getByRole("button", { name: "Tatiane", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(explorer.getByRole("heading", { name: "Cada conta" })).toBeVisible();
    // Cada minigráfico abre ampliado no centro da tela; Esc fecha.
    await explorer.locator('button[aria-haspopup="dialog"]').first().click();
    const accountDialog = page.getByRole("dialog");
    await expect(accountDialog).toBeVisible();
    await expect(accountDialog.getByRole("columnheader", { name: "Saldo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(accountDialog).toBeHidden();
    const debts = page.locator("section", { has: page.getByRole("heading", { name: "Dívidas do cartão" }) });
    await expect(debts.getByText(/Desde abril, venceram/)).toBeVisible();
    await debts.getByRole("tab", { name: "Próximos meses" }).click();
    await expect(debts.getByText(/Sem compras novas, as parcelas já lançadas terminam em/)).toBeVisible();

    const backup = await page.evaluate(async () => {
      const response = await fetch("/api/backup/export");
      return response.json();
    });
    expect(backup.household.id).toBe(testRunId);
    expect(backup.snapshots.length).toBeGreaterThanOrEqual(14);
    expect(backup.goals).toHaveLength(20);
    expect(backup.goals.some((goal: { title: string }) => goal.title === "TOTAL GERAL:" || goal.title === "MARCO")).toBe(false);

    // Planilha só para leitura: o resumo mensal fecha com o patrimônio da visão geral.
    await page.goto("/relatorios");
    const downloading = page.waitForEvent("download");
    await page.getByRole("link", { name: "Baixar planilha atualizada (.xlsx)" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe("relatorio-financeiro-2026-05.xlsx");
    const workbook = XLSX.read(fs.readFileSync(await download.path()), { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Resumo mensal", "Contas mês a mês", "Dívidas do cartão", "Orçamento", "Metas"]);
    const summary = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["Resumo mensal"], { header: 1 });
    expect(summary).toHaveLength(15);
    expect(summary.at(-1)?.[5]).toBe(275223.18);
  });

  test("opens each person's page from the menu", async ({ page }) => {
    test.skip(!fs.existsSync(workbookPath), `Workbook not found: ${workbookPath}`);

    await login(page);
    await page.getByRole("link", { name: "Tatiane", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Tatiane", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Patrimônio líquido de Tatiane")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mês a mês" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Patrimônio líquido" })).toBeVisible();
    // Sem a chave Família/pessoa: a página já é de uma pessoa só.
    await expect(page.getByRole("group", { name: "Pessoa da evolução" })).toHaveCount(0);
  });

  test("creates and closes a monthly snapshot through the wizard", async ({ page }) => {
    await login(page);
    await page.goto("/fechamento");
    await expect(page.getByRole("heading", { name: "Fechar o mês" })).toBeVisible();

    // Passo 1 — mês e Selic.
    await page.getByLabel("Mês de referência").fill("2098-02");
    await page.getByRole("button", { name: "Começar rascunho" }).click();
    await expect(page.getByText("Rascunho criado. Informe os saldos por conta.")).toBeVisible({ timeout: 30_000 });

    // Passo 2 — posição avulsa: adiciona e remove.
    await page.getByRole("button", { name: "Adicionar posição avulsa" }).click();
    await page.getByRole("combobox", { name: "Conta da posição avulsa" }).selectOption({ label: "Bruno — Cashback" });
    await page.getByPlaceholder("Valor").fill("123.45");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByText("Posição adicionada ao rascunho.")).toBeVisible({ timeout: 30_000 });

    // Duas linhas na mesma conta ganham numeração: "Cashback (1)" e "Cashback (2)".
    await expect(page.getByLabel("Saldo de Bruno — Cashback (2)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remover posição Cashback (2)", exact: true }).click();
    await expect(page.getByText("Posição removida do rascunho.")).toBeVisible({ timeout: 30_000 });

    // Campo em branco não vira R$ 0 em silêncio: o app bloqueia e aponta qual é.
    await page.getByLabel("Saldo de Bruno — VR", { exact: true }).fill("");
    await page.getByRole("button", { name: "Salvar e revisar" }).click();
    await expect(page.getByText(/Preencha os saldos em branco .*Bruno — VR/)).toBeVisible();
    await page.getByLabel("Saldo de Bruno — VR", { exact: true }).fill("0");

    // Passo 2 — saldos por conta.
    await page.getByLabel("Saldo de Bruno — Nubank", { exact: true }).fill("10000");
    await page.getByLabel("Saldo de Bruno — Investimentos", { exact: true }).fill("30000");
    await page.getByLabel("Saldo de Tatiane — Caixa", { exact: true }).fill("5000");
    await page.getByLabel("Saldo de Tatiane — Investimentos", { exact: true }).fill("15000");

    // Contas que tinham saldo no mês anterior e ficaram em R$ 0 pedem uma
    // confirmação explícita (window.confirm) antes de salvar.
    const zeroWarning = nextDialogMessage(page);
    await page.getByRole("button", { name: "Salvar e revisar" }).click();
    expect(await zeroWarning).toMatch(/Confira estes saldos antes de salvar/);
    await expect(page.getByText("Saldos e notas salvos; prévia recalculada.")).toBeVisible({ timeout: 30_000 });

    // Passo 3 — revisão de dívidas e orçamento. Quem tinha dívida no último
    // fechamento e não declarou nada nesta base recebe um aviso.
    await expect(page.getByRole("heading", { name: "Cartão e dívidas" })).toBeVisible();
    await expect(page.getByText(/Nenhuma dívida declarada nesta base para/)).toBeVisible();
    await page.getByRole("button", { name: "Ir para o fechamento" }).click();

    // Passo 4 — fechamento (sem as dívidas da base, pede confirmação).
    await expect(page.getByRole("heading", { name: "Fechar fevereiro" })).toBeVisible();
    const debtWarning = nextDialogMessage(page);
    await page.getByRole("button", { name: "Fechar fevereiro", exact: true }).click();
    expect(await debtWarning).toMatch(/Fechar mesmo assim\?/);
    await expect(page.getByText("Mês fechado com sucesso.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "fevereiro está fechado" })).toBeVisible();

    // Novo rascunho em outro mês e exclusão (com window.confirm).
    await page.getByRole("button", { name: "Fechar outro mês" }).click();
    await page.getByLabel("Mês de referência").fill("2098-04");
    await page.getByRole("button", { name: "Começar rascunho" }).click();
    await expect(page.getByText("Rascunho criado. Informe os saldos por conta.")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Excluir rascunho" }).click();
    await expect(page.getByText("Rascunho excluído.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Começar rascunho" })).toBeVisible();
  });

  test("replaces a declared debt for the same due month and edits it inline", async ({ page }) => {
    await login(page);
    await page.goto("/dividas");
    await expect(page.getByRole("heading", { name: "Cartão e dívidas" })).toBeVisible();

    // Registra 1.000 para o vencimento 2098-03.
    await page.getByLabel("Pessoa").selectOption({ label: "Bruno" });
    await page.getByLabel("Vencimento", { exact: true }).fill("2098-03");
    await page.getByLabel("Valor", { exact: true }).fill("1000");
    await page.getByLabel("Descrição").fill("Dívida e2e");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByText("Lançamento salvo.")).toBeVisible();
    await expect(page.getByText("Dívida e2e", { exact: true })).toBeVisible();

    // Registrar de novo para o mesmo (pessoa, mês de vencimento) SUBSTITUI o valor.
    await page.getByLabel("Valor", { exact: true }).fill("1250");
    await page.getByLabel("Descrição").fill("Dívida e2e ajustada");
    await page.getByRole("button", { name: "Adicionar", exact: true }).click();
    await expect(page.getByText("Dívida e2e ajustada")).toBeVisible();
    await expect(page.getByText("1 lançamento", { exact: true })).toBeVisible();

    const backup = await page.evaluate(async () => {
      const response = await fetch("/api/backup/export");
      return response.json();
    });
    const dueMarch = backup.debtCashflows.filter((flow: { paymentMonth: string }) => String(flow.paymentMonth).startsWith("2098-03"));
    expect(dueMarch).toHaveLength(1);
    expect(Number(dueMarch[0].amount)).toBe(1250);
    expect(dueMarch[0].description).toBe("Dívida e2e ajustada");

    // Edição inline na linha do tempo.
    const timeline = page.locator("section").filter({ hasText: "Linha do tempo de vencimentos" });
    await page.getByRole("button", { name: "Editar lançamento de Bruno", exact: true }).click();
    await timeline.getByLabel("Valor", { exact: true }).fill("1300");
    await timeline.getByRole("button", { name: "Salvar lançamento", exact: true }).click();
    await expect(page.getByText("Lançamento atualizado.")).toBeVisible();
    await expect(page.getByText("R$ 1.300,00").first()).toBeVisible();
  });

  // Requer o app iniciado com a IA apontando para o provedor simulado deste teste:
  // AI_FEATURES_ENABLED=true, AI_PROVIDER=openai, AI_VISION_MODEL=<qualquer>,
  // OPENAI_API_KEY=<qualquer>, OPENAI_BASE_URL=http://127.0.0.1:<E2E_AI_MOCK_PORT>/v1.
  test("fills balances from bank prints with a simulated vision provider, saving only on the human click", async ({ page }) => {
    const mockPort = Number(process.env.E2E_AI_MOCK_PORT);
    test.skip(!mockPort, "Defina E2E_AI_MOCK_PORT e suba o app com OPENAI_BASE_URL apontando para o provedor simulado.");

    const provider = await startMockVisionProvider(mockPort, {
      reads: [
        { imageIndex: 1, institution: "Nubank", accountLabel: "Conta", holderName: "Olá, Bruno", kind: "cash", amountRaw: "R$ 12.345,67", excerpt: "Saldo em conta R$ 12.345,67", confidence: 0.97, note: null },
        { imageIndex: 2, institution: "Alelo", accountLabel: "Refeição", holderName: null, kind: "benefit", amountRaw: "R$ 512,30", excerpt: "Refeição R$ 512,30", confidence: 0.93, note: null },
        { imageIndex: 2, institution: "XP", accountLabel: "Patrimônio total", holderName: null, kind: "investment", amountRaw: "R$ 45.000,00", excerpt: "Patrimônio total R$ 45.000,00", confidence: 0.9, note: null },
        { imageIndex: 2, institution: "Itaú", accountLabel: "Saldo", holderName: null, kind: "other", amountRaw: "R$ ••••", excerpt: "Saldo R$ ••••", confidence: 0.4, note: "valor oculto" },
      ],
      warnings: [],
    });
    try {
      await login(page);
      await page.goto("/fechamento");
      await page.getByLabel("Mês de referência").fill("2098-07");
      await page.getByRole("button", { name: "Começar rascunho" }).click();
      await expect(page.getByText("Rascunho criado. Informe os saldos por conta.")).toBeVisible({ timeout: 30_000 });

      // Dois prints (PNG mínimo válido); a leitura devolve 4 saldos para revisão.
      const tinyPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
      await page.getByLabel("Prints dos apps dos bancos").setInputFiles([
        { name: "nubank.png", mimeType: "image/png", buffer: tinyPng },
        { name: "beneficios.png", mimeType: "image/png", buffer: tinyPng },
      ]);
      await expect(page.getByText("4 saldos lidos, 2 com conta sugerida.", { exact: false })).toBeVisible({ timeout: 30_000 });
      expect(provider.calls).toHaveLength(1);
      expect(provider.calls[0].imageCount).toBe(2);
      expect(provider.calls[0].texts).toEqual(expect.arrayContaining(["Print 1:", "Print 2:"]));

      // A leitura não grava nada: o rascunho continua zerado no banco.
      const draftAmounts = async () =>
        page.evaluate(async () => {
          const snapshots = (await (await fetch("/api/monthly-snapshots")).json()) as Array<{
            periodMonth: string;
            positions: Array<{ amount: string; source: string; person: { name: string }; account: { name: string } | null }>;
          }>;
          const draft = snapshots.find((snapshot) => snapshot.periodMonth.startsWith("2098-07"));
          return (draft?.positions ?? []).map((position) => ({
            label: `${position.person.name} — ${position.account?.name}`,
            amount: Number(position.amount),
            source: position.source,
          }));
        });
      expect((await draftAmounts()).every((position) => position.amount === 0 && position.source === "manual")).toBe(true);

      // Salvar com leituras ainda fora dos campos pede confirmação; cancelando, nada é gravado.
      const pendingWarning = new Promise<string>((resolve) => {
        page.once("dialog", (dialog) => {
          resolve(dialog.message());
          void dialog.dismiss();
        });
      });
      await page.getByRole("button", { name: "Salvar e revisar" }).click();
      expect(await pendingWarning).toMatch(/2 saldos lidos dos prints ainda não foram para os campos/);
      await expect(page.getByText(/Saldos não salvos\. Clique em "Preencher"/)).toBeVisible();
      page.on("dialog", (dialog) => void dialog.accept());

      // Leituras sem conta certa ficam visíveis: a ambígua pede escolha, a ilegível não preenche nada.
      const reader = page.getByRole("region", { name: "Leitor de prints dos bancos" });
      await expect(reader.getByText(/Mais de uma conta possível/)).toBeVisible();
      await expect(reader.getByText(/Não lido \(R\$ ••••\)/)).toBeVisible();
      await reader.getByLabel("Conta para o saldo lido de XP — Patrimônio total").selectOption({ label: "Tatiane — Investimentos" });
      await reader.getByRole("button", { name: "Preencher 3 campos" }).click();

      await expect(page.getByLabel("Saldo de Bruno — Nubank", { exact: true })).toHaveValue("12345.67");
      await expect(page.getByLabel("Saldo de Bruno — VR", { exact: true })).toHaveValue("512.30");
      await expect(page.getByLabel("Saldo de Tatiane — Investimentos", { exact: true })).toHaveValue("45000.00");
      await expect(page.getByText("do print", { exact: true })).toHaveCount(3);

      // Editar um valor lido tira a marca: ele passa a contar como digitado.
      await page.getByLabel("Saldo de Tatiane — Investimentos", { exact: true }).fill("45000.5");
      await expect(page.getByText("do print", { exact: true })).toHaveCount(2);

      // Só o botão humano grava (com a confirmação de contas zeradas aceita acima).
      await page.getByRole("button", { name: "Salvar e revisar" }).click();
      await expect(page.getByText("Saldos e notas salvos; prévia recalculada.")).toBeVisible({ timeout: 30_000 });

      const saved = await draftAmounts();
      expect(saved).toEqual(
        expect.arrayContaining([
          { label: "Bruno — Nubank", amount: 12345.67, source: "ai_extracted" },
          { label: "Bruno — VR", amount: 512.3, source: "ai_extracted" },
          { label: "Tatiane — Investimentos", amount: 45000.5, source: "manual" },
          { label: "Tatiane — Caixa", amount: 0, source: "manual" },
        ]),
      );
      expect(provider.calls).toHaveLength(1);
    } finally {
      await provider.close();
    }
  });
});

/** Aceita o próximo window.confirm da página e devolve o texto exibido. */
function nextDialogMessage(page: Page) {
  return new Promise<string>((resolve) => {
    page.once("dialog", (dialog) => {
      resolve(dialog.message());
      void dialog.accept();
    });
  });
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  // Após o login o app passa pela tela de transição /welcome e segue ao dashboard.
  await expect(page.getByRole("heading", { name: "Bem-vindo, Bruno Savastano" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
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
