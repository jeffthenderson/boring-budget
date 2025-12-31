-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreallocationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "charityPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retirementAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherSavingsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreallocationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeItem" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountBudgeted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringDefinition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "merchantLabel" TEXT NOT NULL,
    "displayLabel" TEXT,
    "nominalAmount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "schedulingRule" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "subDescription" TEXT,
    "userDescription" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "source" TEXT NOT NULL,
    "isIgnored" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringInstance" BOOLEAN NOT NULL DEFAULT false,
    "recurringDefinitionId" TEXT,
    "importBatchId" TEXT,
    "externalId" TEXT,
    "sourceImportHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "displayAlias" TEXT,
    "last4" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skippedDuplicates" INTEGER NOT NULL DEFAULT 0,
    "ignoredTransfers" INTEGER NOT NULL DEFAULT 0,
    "ignoredByRule" INTEGER NOT NULL DEFAULT 0,
    "matchedRecurring" INTEGER NOT NULL DEFAULT 0,
    "pendingConfirmation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "rawLineNumber" INTEGER NOT NULL,
    "rawData" TEXT NOT NULL,
    "parsedDate" TIMESTAMP(3) NOT NULL,
    "parsedDescription" TEXT NOT NULL,
    "parsedSubDescription" TEXT,
    "parsedAmountBeforeNorm" DOUBLE PRECISION NOT NULL,
    "normalizedAmount" DOUBLE PRECISION NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "externalId" TEXT,
    "hashKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ignoreReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferGroup" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "leftTransactionId" TEXT,
    "rightTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ignored',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgnoreRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "normalizedPattern" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgnoreRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringSuggestionDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "suggestionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringSuggestionDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMappingRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawDescription" TEXT NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryMappingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMappingDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryMappingDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amazonOrderId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "orderTotal" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "orderUrl" TEXT,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "matchStatus" TEXT NOT NULL DEFAULT 'unmatched',
    "matchedTransactionId" TEXT,
    "matchMetadata" JSONB,
    "category" TEXT,
    "categoryConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AmazonOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreallocationSettings_userId_key" ON "PreallocationSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetPeriod_userId_year_month_key" ON "BudgetPeriod"("userId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_periodId_category_key" ON "CategoryBudget"("periodId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "RawImportRow_accountId_hashKey_key" ON "RawImportRow"("accountId", "hashKey");

-- CreateIndex
CREATE UNIQUE INDEX "TransferGroup_leftTransactionId_key" ON "TransferGroup"("leftTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferGroup_rightTransactionId_key" ON "TransferGroup"("rightTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "IgnoreRule_userId_normalizedPattern_key" ON "IgnoreRule"("userId", "normalizedPattern");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSuggestionDismissal_userId_suggestionKey_key" ON "RecurringSuggestionDismissal"("userId", "suggestionKey");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMappingRule_userId_normalizedDescription_key" ON "CategoryMappingRule"("userId", "normalizedDescription");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMappingDismissal_userId_normalizedDescription_key" ON "CategoryMappingDismissal"("userId", "normalizedDescription");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonOrder_matchedTransactionId_key" ON "AmazonOrder"("matchedTransactionId");

-- CreateIndex
CREATE INDEX "AmazonOrder_userId_orderDate_idx" ON "AmazonOrder"("userId", "orderDate");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonOrder_userId_amazonOrderId_key" ON "AmazonOrder"("userId", "amazonOrderId");

-- AddForeignKey
ALTER TABLE "PreallocationSettings" ADD CONSTRAINT "PreallocationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPeriod" ADD CONSTRAINT "BudgetPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeItem" ADD CONSTRAINT "IncomeItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "BudgetPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "BudgetPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringDefinition" ADD CONSTRAINT "RecurringDefinition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "BudgetPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringDefinitionId_fkey" FOREIGN KEY ("recurringDefinitionId") REFERENCES "RecurringDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "BudgetPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawImportRow" ADD CONSTRAINT "RawImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawImportRow" ADD CONSTRAINT "RawImportRow_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferGroup" ADD CONSTRAINT "TransferGroup_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "BudgetPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferGroup" ADD CONSTRAINT "TransferGroup_leftTransactionId_fkey" FOREIGN KEY ("leftTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferGroup" ADD CONSTRAINT "TransferGroup_rightTransactionId_fkey" FOREIGN KEY ("rightTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgnoreRule" ADD CONSTRAINT "IgnoreRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSuggestionDismissal" ADD CONSTRAINT "RecurringSuggestionDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMappingRule" ADD CONSTRAINT "CategoryMappingRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMappingDismissal" ADD CONSTRAINT "CategoryMappingDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonOrder" ADD CONSTRAINT "AmazonOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonOrder" ADD CONSTRAINT "AmazonOrder_matchedTransactionId_fkey" FOREIGN KEY ("matchedTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonOrderItem" ADD CONSTRAINT "AmazonOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AmazonOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
