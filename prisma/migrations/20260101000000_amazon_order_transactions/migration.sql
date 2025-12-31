-- CreateTable
CREATE TABLE "AmazonOrderTransaction" (
    "orderId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmazonOrderTransaction_pkey" PRIMARY KEY ("orderId","transactionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "AmazonOrderTransaction_transactionId_key" ON "AmazonOrderTransaction"("transactionId");

-- AddForeignKey
ALTER TABLE "AmazonOrderTransaction" ADD CONSTRAINT "AmazonOrderTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AmazonOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonOrderTransaction" ADD CONSTRAINT "AmazonOrderTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data migration
INSERT INTO "AmazonOrderTransaction" ("orderId", "transactionId")
SELECT "id", "matchedTransactionId" FROM "AmazonOrder" WHERE "matchedTransactionId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "AmazonOrder" DROP CONSTRAINT "AmazonOrder_matchedTransactionId_fkey";

-- DropIndex
DROP INDEX "AmazonOrder_matchedTransactionId_key";

-- AlterTable
ALTER TABLE "AmazonOrder" DROP COLUMN "matchedTransactionId";
