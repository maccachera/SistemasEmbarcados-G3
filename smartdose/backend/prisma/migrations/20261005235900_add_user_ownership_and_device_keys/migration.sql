-- Associate application data with its owner and store only hashes of device keys.
ALTER TABLE "public"."Device"
ADD COLUMN "userId" INTEGER,
ADD COLUMN "apiKeyHash" TEXT;

ALTER TABLE "public"."Medication"
ADD COLUMN "userId" INTEGER;

-- Preserve existing installations by assigning current data to the oldest
-- registered account. If no account exists yet, the first registration claims it.
UPDATE "public"."Device"
SET "userId" = (SELECT "id" FROM "public"."User" ORDER BY "id" LIMIT 1)
WHERE "userId" IS NULL
  AND EXISTS (SELECT 1 FROM "public"."User");

UPDATE "public"."Medication"
SET "userId" = (SELECT "id" FROM "public"."User" ORDER BY "id" LIMIT 1)
WHERE "userId" IS NULL
  AND EXISTS (SELECT 1 FROM "public"."User");

CREATE UNIQUE INDEX "Device_apiKeyHash_key" ON "public"."Device"("apiKeyHash");
CREATE INDEX "Device_userId_idx" ON "public"."Device"("userId");
CREATE INDEX "Medication_userId_idx" ON "public"."Medication"("userId");

ALTER TABLE "public"."Device"
ADD CONSTRAINT "Device_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Medication"
ADD CONSTRAINT "Medication_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
