-- AlterTable
ALTER TABLE "PreallocationSettings" ADD COLUMN "hideInternalTransfers" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "authorizedDate" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "postedDate" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "isInternalTransfer" BOOLEAN NOT NULL DEFAULT false;
