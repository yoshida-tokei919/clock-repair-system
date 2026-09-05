-- Create standard part category master
CREATE TABLE "PartCategoryMaster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "partType" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartCategoryMaster_pkey" PRIMARY KEY ("id")
);

-- Create standard part name master
CREATE TABLE "PartNameMaster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "partType" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "displayJa" TEXT,
    "displayEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartNameMaster_pkey" PRIMARY KEY ("id")
);

-- Create grade master
CREATE TABLE "PartGradeMaster" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartGradeMaster_pkey" PRIMARY KEY ("id")
);

-- Add nullable master references to PartsMaster
ALTER TABLE "PartsMaster"
    ADD COLUMN "standardPartNameId" TEXT,
    ADD COLUMN "gradeId" TEXT;

-- Create unique constraints
CREATE UNIQUE INDEX "PartCategoryMaster_key_key" ON "PartCategoryMaster"("key");
CREATE UNIQUE INDEX "PartNameMaster_key_key" ON "PartNameMaster"("key");
CREATE UNIQUE INDEX "PartGradeMaster_key_key" ON "PartGradeMaster"("key");

-- Create indexes
CREATE INDEX "PartCategoryMaster_partType_idx" ON "PartCategoryMaster"("partType");
CREATE INDEX "PartCategoryMaster_partType_sortOrder_idx" ON "PartCategoryMaster"("partType", "sortOrder");
CREATE INDEX "PartNameMaster_partType_idx" ON "PartNameMaster"("partType");
CREATE INDEX "PartNameMaster_categoryId_idx" ON "PartNameMaster"("categoryId");
CREATE INDEX "PartNameMaster_partType_categoryId_idx" ON "PartNameMaster"("partType", "categoryId");
CREATE INDEX "PartNameMaster_partType_sortOrder_idx" ON "PartNameMaster"("partType", "sortOrder");
CREATE INDEX "PartGradeMaster_sortOrder_idx" ON "PartGradeMaster"("sortOrder");
CREATE INDEX "PartsMaster_standardPartNameId_idx" ON "PartsMaster"("standardPartNameId");
CREATE INDEX "PartsMaster_gradeId_idx" ON "PartsMaster"("gradeId");

-- Add foreign key constraints
ALTER TABLE "PartNameMaster"
    ADD CONSTRAINT "PartNameMaster_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "PartCategoryMaster"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PartsMaster"
    ADD CONSTRAINT "PartsMaster_standardPartNameId_fkey"
    FOREIGN KEY ("standardPartNameId") REFERENCES "PartNameMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartsMaster"
    ADD CONSTRAINT "PartsMaster_gradeId_fkey"
    FOREIGN KEY ("gradeId") REFERENCES "PartGradeMaster"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
