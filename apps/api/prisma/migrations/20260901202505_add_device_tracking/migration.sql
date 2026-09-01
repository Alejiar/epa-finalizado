-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('pending', 'approved', 'blocked');

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceName" TEXT;

-- AlterTable
ALTER TABLE "BaseTransaction" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceName" TEXT;

-- AlterTable
ALTER TABLE "ClientDebt" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceName" TEXT,
ADD COLUMN     "paidDeviceId" TEXT,
ADD COLUMN     "paidDeviceName" TEXT;

-- AlterTable
ALTER TABLE "Conversion" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceName" TEXT;

-- AlterTable
ALTER TABLE "DriverPayment" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceName" TEXT;

-- AlterTable
ALTER TABLE "Movement" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "deviceName" TEXT;

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'pending',
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "firstUserId" TEXT,
    "firstUserName" TEXT,
    "lastUserName" TEXT,
    "firstSeenIp" TEXT,
    "lastSeenIp" TEXT,
    "userAgent" TEXT,
    "approvedBy" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "logoutRequestedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "action" TEXT,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_status_idx" ON "Device"("status");

-- CreateIndex
CREATE INDEX "Device_lastSeenAt_idx" ON "Device"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ActivityLog_deviceId_idx" ON "ActivityLog"("deviceId");

-- CreateIndex
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");
