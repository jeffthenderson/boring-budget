-- AlterTable
ALTER TABLE "RawImportRow" ADD COLUMN "parsedSubDescription" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "subDescription" TEXT,
    "userDescription" TEXT,
    "amount" REAL NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "source" TEXT NOT NULL,
    "isIgnored" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringInstance" BOOLEAN NOT NULL DEFAULT false,
    "recurringDefinitionId" TEXT,
    "importBatchId" TEXT,
    "externalId" TEXT,
    "sourceImportHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "BudgetPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_recurringDefinitionId_fkey" FOREIGN KEY ("recurringDefinitionId") REFERENCES "RecurringDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("amount", "category", "createdAt", "date", "description", "externalId", "id", "importBatchId", "isRecurringInstance", "periodId", "recurringDefinitionId", "source", "sourceImportHash", "status", "updatedAt", "userDescription") SELECT "amount", "category", "createdAt", "date", "description", "externalId", "id", "importBatchId", "isRecurringInstance", "periodId", "recurringDefinitionId", "source", "sourceImportHash", "status", "updatedAt", "userDescription" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
