-- Allow duplicate-looking rows within the same CSV import.
-- We still dedupe against existing DB data in application logic.
DROP INDEX IF EXISTS "RawImportRow_accountId_hashKey_key";
CREATE INDEX IF NOT EXISTS "RawImportRow_accountId_hashKey_idx"
  ON "RawImportRow" ("accountId", "hashKey");
