-- CreateEnum
CREATE TYPE "RepairPartAllocationState" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- CreateTable
CREATE TABLE "RepairPartAllocation" (
    "id" SERIAL NOT NULL,
    "repairId" INTEGER NOT NULL,
    "partsMasterId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "state" "RepairPartAllocationState" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "RepairPartAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairPartAllocation_repairId_partsMasterId_key" ON "RepairPartAllocation"("repairId", "partsMasterId");
CREATE INDEX "RepairPartAllocation_repairId_state_idx" ON "RepairPartAllocation"("repairId", "state");
CREATE INDEX "RepairPartAllocation_partsMasterId_state_idx" ON "RepairPartAllocation"("partsMasterId", "state");

-- AddForeignKey
ALTER TABLE "RepairPartAllocation" ADD CONSTRAINT "RepairPartAllocation_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RepairPartAllocation" ADD CONSTRAINT "RepairPartAllocation_partsMasterId_fkey" FOREIGN KEY ("partsMasterId") REFERENCES "PartsMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
