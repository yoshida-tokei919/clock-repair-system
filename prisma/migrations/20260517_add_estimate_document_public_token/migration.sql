-- AlterTable
ALTER TABLE "EstimateDocument" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "EstimateDocument" ADD COLUMN "publicTokenCreatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "EstimateDocument_publicToken_key" ON "EstimateDocument"("publicToken");
