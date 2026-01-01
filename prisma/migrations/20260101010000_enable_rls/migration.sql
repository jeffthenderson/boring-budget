-- Enable RLS for all user data tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreallocationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BudgetPeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IncomeItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CategoryBudget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransactionLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RawImportRow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TransferGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IgnoreRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecurringSuggestionDismissal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CategoryMappingRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CategoryMappingDismissal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AmazonOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AmazonOrderTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AmazonOrderItem" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PreallocationSettings" FORCE ROW LEVEL SECURITY;
ALTER TABLE "BudgetPeriod" FORCE ROW LEVEL SECURITY;
ALTER TABLE "IncomeItem" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CategoryBudget" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RecurringDefinition" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Transaction" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Account" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TransactionLink" FORCE ROW LEVEL SECURITY;
ALTER TABLE "ImportBatch" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RawImportRow" FORCE ROW LEVEL SECURITY;
ALTER TABLE "TransferGroup" FORCE ROW LEVEL SECURITY;
ALTER TABLE "IgnoreRule" FORCE ROW LEVEL SECURITY;
ALTER TABLE "RecurringSuggestionDismissal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CategoryMappingRule" FORCE ROW LEVEL SECURITY;
ALTER TABLE "CategoryMappingDismissal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AmazonOrder" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AmazonOrderTransaction" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AmazonOrderItem" FORCE ROW LEVEL SECURITY;

-- User-owned tables
CREATE POLICY "User select" ON "User"
  FOR SELECT USING (id = auth.uid()::text);
CREATE POLICY "User insert" ON "User"
  FOR INSERT WITH CHECK (id = auth.uid()::text);
CREATE POLICY "User update" ON "User"
  FOR UPDATE USING (id = auth.uid()::text) WITH CHECK (id = auth.uid()::text);
CREATE POLICY "User delete" ON "User"
  FOR DELETE USING (id = auth.uid()::text);

CREATE POLICY "PreallocationSettings select" ON "PreallocationSettings"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "PreallocationSettings insert" ON "PreallocationSettings"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "PreallocationSettings update" ON "PreallocationSettings"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "PreallocationSettings delete" ON "PreallocationSettings"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "BudgetPeriod select" ON "BudgetPeriod"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "BudgetPeriod insert" ON "BudgetPeriod"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "BudgetPeriod update" ON "BudgetPeriod"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "BudgetPeriod delete" ON "BudgetPeriod"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "RecurringDefinition select" ON "RecurringDefinition"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "RecurringDefinition insert" ON "RecurringDefinition"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "RecurringDefinition update" ON "RecurringDefinition"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "RecurringDefinition delete" ON "RecurringDefinition"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "Account select" ON "Account"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "Account insert" ON "Account"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "Account update" ON "Account"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "Account delete" ON "Account"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "IgnoreRule select" ON "IgnoreRule"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "IgnoreRule insert" ON "IgnoreRule"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "IgnoreRule update" ON "IgnoreRule"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "IgnoreRule delete" ON "IgnoreRule"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "RecurringSuggestionDismissal select" ON "RecurringSuggestionDismissal"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "RecurringSuggestionDismissal insert" ON "RecurringSuggestionDismissal"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "RecurringSuggestionDismissal update" ON "RecurringSuggestionDismissal"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "RecurringSuggestionDismissal delete" ON "RecurringSuggestionDismissal"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "CategoryMappingRule select" ON "CategoryMappingRule"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "CategoryMappingRule insert" ON "CategoryMappingRule"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "CategoryMappingRule update" ON "CategoryMappingRule"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "CategoryMappingRule delete" ON "CategoryMappingRule"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "CategoryMappingDismissal select" ON "CategoryMappingDismissal"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "CategoryMappingDismissal insert" ON "CategoryMappingDismissal"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "CategoryMappingDismissal update" ON "CategoryMappingDismissal"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "CategoryMappingDismissal delete" ON "CategoryMappingDismissal"
  FOR DELETE USING ("userId" = auth.uid()::text);

CREATE POLICY "AmazonOrder select" ON "AmazonOrder"
  FOR SELECT USING ("userId" = auth.uid()::text);
CREATE POLICY "AmazonOrder insert" ON "AmazonOrder"
  FOR INSERT WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "AmazonOrder update" ON "AmazonOrder"
  FOR UPDATE USING ("userId" = auth.uid()::text) WITH CHECK ("userId" = auth.uid()::text);
CREATE POLICY "AmazonOrder delete" ON "AmazonOrder"
  FOR DELETE USING ("userId" = auth.uid()::text);

-- Tables owned through parent relations
CREATE POLICY "IncomeItem select" ON "IncomeItem"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "IncomeItem"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "IncomeItem insert" ON "IncomeItem"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "IncomeItem"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "IncomeItem update" ON "IncomeItem"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "IncomeItem"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "IncomeItem"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "IncomeItem delete" ON "IncomeItem"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "IncomeItem"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "CategoryBudget select" ON "CategoryBudget"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "CategoryBudget"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "CategoryBudget insert" ON "CategoryBudget"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "CategoryBudget"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "CategoryBudget update" ON "CategoryBudget"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "CategoryBudget"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "CategoryBudget"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "CategoryBudget delete" ON "CategoryBudget"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "CategoryBudget"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "Transaction select" ON "Transaction"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "Transaction"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "Transaction insert" ON "Transaction"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "Transaction"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "Transaction update" ON "Transaction"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "Transaction"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "Transaction"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "Transaction delete" ON "Transaction"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "Transaction"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "TransactionLink select" ON "TransactionLink"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."fromTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."toTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "TransactionLink insert" ON "TransactionLink"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."fromTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."toTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "TransactionLink update" ON "TransactionLink"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."fromTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."toTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."fromTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."toTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "TransactionLink delete" ON "TransactionLink"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."fromTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "TransactionLink"."toTransactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "ImportBatch select" ON "ImportBatch"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "ImportBatch"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "ImportBatch insert" ON "ImportBatch"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "ImportBatch"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "ImportBatch update" ON "ImportBatch"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "ImportBatch"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "ImportBatch"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "ImportBatch delete" ON "ImportBatch"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "ImportBatch"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "RawImportRow select" ON "RawImportRow"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "RawImportRow"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "RawImportRow insert" ON "RawImportRow"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "RawImportRow"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "RawImportRow update" ON "RawImportRow"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "RawImportRow"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "RawImportRow"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "RawImportRow delete" ON "RawImportRow"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "Account"
      WHERE "Account".id = "RawImportRow"."accountId"
        AND "Account"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "TransferGroup select" ON "TransferGroup"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "TransferGroup"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "TransferGroup insert" ON "TransferGroup"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "TransferGroup"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "TransferGroup update" ON "TransferGroup"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "TransferGroup"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "TransferGroup"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "TransferGroup delete" ON "TransferGroup"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "BudgetPeriod"
      WHERE "BudgetPeriod".id = "TransferGroup"."periodId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "AmazonOrderTransaction select" ON "AmazonOrderTransaction"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderTransaction"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "AmazonOrderTransaction"."transactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "AmazonOrderTransaction insert" ON "AmazonOrderTransaction"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderTransaction"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "AmazonOrderTransaction"."transactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "AmazonOrderTransaction update" ON "AmazonOrderTransaction"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderTransaction"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "AmazonOrderTransaction"."transactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderTransaction"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "AmazonOrderTransaction"."transactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "AmazonOrderTransaction delete" ON "AmazonOrderTransaction"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderTransaction"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
    AND EXISTS (
      SELECT 1 FROM "Transaction"
      JOIN "BudgetPeriod" ON "BudgetPeriod".id = "Transaction"."periodId"
      WHERE "Transaction".id = "AmazonOrderTransaction"."transactionId"
        AND "BudgetPeriod"."userId" = auth.uid()::text
    )
  );

CREATE POLICY "AmazonOrderItem select" ON "AmazonOrderItem"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderItem"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "AmazonOrderItem insert" ON "AmazonOrderItem"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderItem"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "AmazonOrderItem update" ON "AmazonOrderItem"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderItem"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderItem"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
  );
CREATE POLICY "AmazonOrderItem delete" ON "AmazonOrderItem"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "AmazonOrder"
      WHERE "AmazonOrder".id = "AmazonOrderItem"."orderId"
        AND "AmazonOrder"."userId" = auth.uid()::text
    )
  );
