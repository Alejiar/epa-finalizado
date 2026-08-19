-- AlterTable
ALTER TABLE "HourlyShift" ADD COLUMN     "driverPaidBy" TEXT,
ADD COLUMN     "driverPaidByName" TEXT,
ADD COLUMN     "paidBank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidBy" TEXT,
ADD COLUMN     "paidByName" TEXT,
ADD COLUMN     "paidCash" INTEGER NOT NULL DEFAULT 0;
