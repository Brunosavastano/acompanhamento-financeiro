-- Add household isolation to interest rates.
ALTER TABLE "interest_rates" ADD COLUMN "householdId" TEXT;

UPDATE "interest_rates"
SET "householdId" = (
    SELECT "id"
    FROM "households"
    ORDER BY "createdAt" ASC
    LIMIT 1
)
WHERE "householdId" IS NULL;

DELETE FROM "interest_rates" WHERE "householdId" IS NULL;

ALTER TABLE "interest_rates" ALTER COLUMN "householdId" SET NOT NULL;

DROP INDEX "interest_rates_periodMonth_rateType_key";

CREATE INDEX "interest_rates_householdId_idx" ON "interest_rates"("householdId");

CREATE UNIQUE INDEX "interest_rates_householdId_periodMonth_rateType_key" ON "interest_rates"("householdId", "periodMonth", "rateType");

ALTER TABLE "interest_rates" ADD CONSTRAINT "interest_rates_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
