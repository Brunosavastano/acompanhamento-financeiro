-- CreateEnum
CREATE TYPE "PersonRole" AS ENUM ('owner', 'spouse', 'dependent');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('cash', 'benefit', 'investment', 'cashback', 'other');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('draft', 'closed', 'revised');

-- CreateEnum
CREATE TYPE "PositionCategory" AS ENUM ('cash', 'benefit', 'investment', 'cashback');

-- CreateEnum
CREATE TYPE "PositionSource" AS ENUM ('manual', 'import', 'adjustment');

-- CreateEnum
CREATE TYPE "DebtSource" AS ENUM ('manual_matrix', 'purchase', 'adjustment', 'import');

-- CreateEnum
CREATE TYPE "BudgetKind" AS ENUM ('income', 'fixed_expense', 'variable_expense');

-- CreateEnum
CREATE TYPE "BudgetRecurrence" AS ENUM ('monthly', 'annualized', 'one_off');

-- CreateEnum
CREATE TYPE "GoalHorizon" AS ENUM ('short', 'medium', 'long');

-- CreateEnum
CREATE TYPE "GoalOperator" AS ENUM ('greater_or_equal', 'less_or_equal', 'equals', 'manual');

-- CreateEnum
CREATE TYPE "GoalProgressStatus" AS ENUM ('achieved', 'in_progress', 'attention', 'long_term');

-- CreateEnum
CREATE TYPE "InterestRateType" AS ENUM ('selic_annual');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('manual', 'external_api', 'import');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "householdId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'BRL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "PersonRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_snapshots" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "periodMonth" TIMESTAMP(3) NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'draft',
    "selicAnnual" DECIMAL(12,8) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "revisedFromId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "accountId" TEXT,
    "category" "PositionCategory" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "source" "PositionSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_cashflows" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "invoiceMonth" TIMESTAMP(3) NOT NULL,
    "paymentMonth" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "source" "DebtSource" NOT NULL DEFAULT 'manual_matrix',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_cashflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "personId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "BudgetKind" NOT NULL,
    "amountMonthly" DECIMAL(18,2) NOT NULL,
    "recurrence" "BudgetRecurrence" NOT NULL DEFAULT 'monthly',
    "startMonth" TIMESTAMP(3) NOT NULL,
    "endMonth" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "horizon" "GoalHorizon" NOT NULL,
    "metricKey" TEXT NOT NULL,
    "targetValueDecimal" DECIMAL(18,6),
    "targetValueText" TEXT,
    "targetDate" TEXT,
    "comparisonOperator" "GoalOperator" NOT NULL,
    "riskCapValue" DECIMAL(18,6),
    "manualCurrentValue" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_progress_snapshots" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "periodMonth" TIMESTAMP(3) NOT NULL,
    "currentValue" TEXT NOT NULL,
    "progressPct" DECIMAL(18,6) NOT NULL,
    "status" "GoalProgressStatus" NOT NULL,

    CONSTRAINT "goal_progress_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interest_rates" (
    "id" TEXT NOT NULL,
    "periodMonth" TIMESTAMP(3) NOT NULL,
    "rateType" "InterestRateType" NOT NULL,
    "annualRate" DECIMAL(12,8) NOT NULL,
    "source" "DataSource" NOT NULL DEFAULT 'manual',

    CONSTRAINT "interest_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_reconciliation_rows" (
    "id" TEXT NOT NULL,
    "importJobId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "periodMonth" TIMESTAMP(3) NOT NULL,
    "metricKey" TEXT NOT NULL,
    "spreadsheetValue" DECIMAL(18,6),
    "appValue" DECIMAL(18,6),
    "delta" DECIMAL(18,6),
    "tolerance" DECIMAL(18,6) NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "notes" TEXT,

    CONSTRAINT "import_reconciliation_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "persons_householdId_idx" ON "persons"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_personId_name_key" ON "accounts"("personId", "name");

-- CreateIndex
CREATE INDEX "monthly_snapshots_householdId_periodMonth_idx" ON "monthly_snapshots"("householdId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_snapshots_householdId_periodMonth_revisionNumber_key" ON "monthly_snapshots"("householdId", "periodMonth", "revisionNumber");

-- CreateIndex
CREATE INDEX "positions_snapshotId_idx" ON "positions"("snapshotId");

-- CreateIndex
CREATE INDEX "positions_personId_idx" ON "positions"("personId");

-- CreateIndex
CREATE INDEX "debt_cashflows_householdId_invoiceMonth_idx" ON "debt_cashflows"("householdId", "invoiceMonth");

-- CreateIndex
CREATE INDEX "debt_cashflows_householdId_paymentMonth_idx" ON "debt_cashflows"("householdId", "paymentMonth");

-- CreateIndex
CREATE INDEX "debt_cashflows_personId_idx" ON "debt_cashflows"("personId");

-- CreateIndex
CREATE INDEX "budget_items_householdId_kind_idx" ON "budget_items"("householdId", "kind");

-- CreateIndex
CREATE INDEX "goals_householdId_horizon_idx" ON "goals"("householdId", "horizon");

-- CreateIndex
CREATE UNIQUE INDEX "goal_progress_snapshots_goalId_periodMonth_key" ON "goal_progress_snapshots"("goalId", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "interest_rates_periodMonth_rateType_key" ON "interest_rates"("periodMonth", "rateType");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "import_jobs_householdId_status_idx" ON "import_jobs"("householdId", "status");

-- CreateIndex
CREATE INDEX "import_reconciliation_rows_importJobId_periodMonth_idx" ON "import_reconciliation_rows"("importJobId", "periodMonth");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persons" ADD CONSTRAINT "persons_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_snapshots" ADD CONSTRAINT "monthly_snapshots_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "monthly_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_cashflows" ADD CONSTRAINT "debt_cashflows_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_cashflows" ADD CONSTRAINT "debt_cashflows_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_progress_snapshots" ADD CONSTRAINT "goal_progress_snapshots_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_reconciliation_rows" ADD CONSTRAINT "import_reconciliation_rows_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_reconciliation_rows" ADD CONSTRAINT "import_reconciliation_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "monthly_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

