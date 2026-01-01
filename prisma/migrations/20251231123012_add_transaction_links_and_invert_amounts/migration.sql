-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "invertAmounts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TransactionLink" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromTransactionId" TEXT NOT NULL,
    "toTransactionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionLink_fromTransactionId_idx" ON "TransactionLink"("fromTransactionId");

-- CreateIndex
CREATE INDEX "TransactionLink_toTransactionId_idx" ON "TransactionLink"("toTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionLink_type_fromTransactionId_toTransactionId_key" ON "TransactionLink"("type", "fromTransactionId", "toTransactionId");

-- AddForeignKey
ALTER TABLE "TransactionLink" ADD CONSTRAINT "TransactionLink_fromTransactionId_fkey" FOREIGN KEY ("fromTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLink" ADD CONSTRAINT "TransactionLink_toTransactionId_fkey" FOREIGN KEY ("toTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
