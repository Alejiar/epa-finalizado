-- CreateTable
CREATE TABLE "DeletedShipdayOrder" (
    "shipdayOrderId" TEXT NOT NULL,
    "branchId" TEXT,
    "orderNumber" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedShipdayOrder_pkey" PRIMARY KEY ("shipdayOrderId")
);
