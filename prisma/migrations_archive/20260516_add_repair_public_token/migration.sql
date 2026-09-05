-- AlterTable
ALTER TABLE "Repair" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "Repair" ADD COLUMN "publicTokenCreatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Repair_publicToken_key" ON "Repair"("publicToken");
