-- CreateTable
CREATE TABLE "RepairCustomerMessage" (
    "id" SERIAL NOT NULL,
    "repairId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "RepairCustomerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairCustomerMessage_repairId_readAt_idx" ON "RepairCustomerMessage"("repairId", "readAt");

-- AddForeignKey
ALTER TABLE "RepairCustomerMessage" ADD CONSTRAINT "RepairCustomerMessage_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
