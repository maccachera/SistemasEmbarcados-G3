-- Add the device relationship without losing existing schedules.
ALTER TABLE "public"."Schedule" ADD COLUMN "deviceId" INTEGER;

-- The current prototype uses this device code. Creating it here makes the
-- migration safe even in databases where the development seed was not run.
INSERT INTO "public"."Device" ("name", "deviceCode", "createdAt", "updatedAt")
SELECT 'SmartDose Principal', 'SMARTDOSE-001', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."Device" WHERE "deviceCode" = 'SMARTDOSE-001'
);

UPDATE "public"."Schedule"
SET "deviceId" = (
  SELECT "id"
  FROM "public"."Device"
  WHERE "deviceCode" = 'SMARTDOSE-001'
  LIMIT 1
)
WHERE "deviceId" IS NULL;

ALTER TABLE "public"."Schedule" ALTER COLUMN "deviceId" SET NOT NULL;

DROP INDEX "public"."Schedule_medicationId_time_key";

CREATE INDEX "Schedule_deviceId_idx" ON "public"."Schedule"("deviceId");
CREATE UNIQUE INDEX "Schedule_deviceId_medicationId_time_key"
ON "public"."Schedule"("deviceId", "medicationId", "time");

ALTER TABLE "public"."Schedule"
ADD CONSTRAINT "Schedule_deviceId_fkey"
FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
