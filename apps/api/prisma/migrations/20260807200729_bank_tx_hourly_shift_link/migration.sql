-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "hourlyShiftId" TEXT;

-- CreateIndex
CREATE INDEX "BankTransaction_hourlyShiftId_idx" ON "BankTransaction"("hourlyShiftId");
