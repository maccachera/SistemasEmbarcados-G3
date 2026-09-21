-- CreateEnum
CREATE TYPE "public"."DoseEventType" AS ENUM ('DOSE_DISPENSED', 'MEDICATION_REMOVED', 'DOSE_NOT_REMOVED', 'DEVICE_ERROR');

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DoseEvent" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "medicationId" INTEGER,
    "scheduleId" INTEGER,
    "eventType" "public"."DoseEventType" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceCode_key" ON "public"."Device"("deviceCode");

-- CreateIndex
CREATE INDEX "DoseEvent_deviceId_idx" ON "public"."DoseEvent"("deviceId");

-- CreateIndex
CREATE INDEX "DoseEvent_medicationId_idx" ON "public"."DoseEvent"("medicationId");

-- CreateIndex
CREATE INDEX "DoseEvent_scheduleId_idx" ON "public"."DoseEvent"("scheduleId");

-- CreateIndex
CREATE INDEX "DoseEvent_occurredAt_idx" ON "public"."DoseEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "public"."DoseEvent" ADD CONSTRAINT "DoseEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DoseEvent" ADD CONSTRAINT "DoseEvent_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "public"."Medication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DoseEvent" ADD CONSTRAINT "DoseEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
