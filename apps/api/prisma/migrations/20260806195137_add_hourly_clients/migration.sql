-- CreateTable
CREATE TABLE "HourlyClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "driverHourValue" INTEGER NOT NULL,
    "companyHourValue" INTEGER NOT NULL,
    "pendingDebt" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HourlyClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HourlyShift" (
    "id" TEXT NOT NULL,
    "hourlyClientId" TEXT NOT NULL,
    "driverId" TEXT,
    "driverName" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "driverAmount" INTEGER NOT NULL,
    "companyAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "driverPaid" BOOLEAN NOT NULL DEFAULT false,
    "driverPaidMedium" "Medium",
    "driverPaidAt" TIMESTAMP(3),
    "driverPaidBankTxId" TEXT,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HourlyShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HourlyShift_hourlyClientId_idx" ON "HourlyShift"("hourlyClientId");

-- CreateIndex
CREATE INDEX "HourlyShift_hourlyClientId_driverPaid_idx" ON "HourlyShift"("hourlyClientId", "driverPaid");

-- CreateIndex
CREATE INDEX "HourlyShift_hourlyClientId_paid_idx" ON "HourlyShift"("hourlyClientId", "paid");

-- AddForeignKey
ALTER TABLE "HourlyShift" ADD CONSTRAINT "HourlyShift_hourlyClientId_fkey" FOREIGN KEY ("hourlyClientId") REFERENCES "HourlyClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
