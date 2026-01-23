-- CreateTable
CREATE TABLE "Admin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "kana" TEXT,
    "companyName" TEXT,
    "zipCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "lineId" TEXT,
    "passwordHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPartner" BOOLEAN NOT NULL DEFAULT false,
    "prefix" TEXT,
    "currentSeq" INTEGER NOT NULL DEFAULT 0,
    "seqEstimate" INTEGER NOT NULL DEFAULT 0,
    "seqDelivery" INTEGER NOT NULL DEFAULT 0,
    "seqInvoice" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "name_jp" TEXT NOT NULL,
    "kana" TEXT,
    "initialChar" TEXT
);

-- CreateTable
CREATE TABLE "Model" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brandId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "name_jp" TEXT NOT NULL,
    "refNumber" TEXT,
    CONSTRAINT "Model_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Caliber" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brandId" INTEGER,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "name_jp" TEXT,
    "movementType" TEXT,
    "standardWorkMinutes" INTEGER NOT NULL DEFAULT 60,
    CONSTRAINT "Caliber_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Watch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brandId" INTEGER NOT NULL,
    "modelId" INTEGER NOT NULL,
    "caliberId" INTEGER,
    "serialNumber" TEXT,
    "customerId" INTEGER NOT NULL,
    "accessories" TEXT,
    CONSTRAINT "Watch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Watch_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Watch_caliberId_fkey" FOREIGN KEY ("caliberId") REFERENCES "Caliber" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Watch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Repair" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "inquiryNumber" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "watchId" INTEGER NOT NULL,
    "partnerRef" TEXT,
    "accessories" TEXT,
    "receptionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
    "approvalDate" DATETIME,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "scheduledDate" DATETIME,
    "estimatedWorkMinutes" INTEGER NOT NULL DEFAULT 0,
    "workSummary" TEXT,
    "isPublicB2C" BOOLEAN NOT NULL DEFAULT false,
    "isPublicB2B" BOOLEAN NOT NULL DEFAULT false,
    "publicTitle" TEXT,
    "publicDescription" TEXT,
    "deliveryDateExpected" DATETIME,
    "deliveryDateActual" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deliveryNoteId" INTEGER,
    "invoiceId" INTEGER,
    "estimateDocumentId" INTEGER,
    CONSTRAINT "Repair_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Repair_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "Watch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Repair_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Repair_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Repair_estimateDocumentId_fkey" FOREIGN KEY ("estimateDocumentId") REFERENCES "EstimateDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairStatusLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repairId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" INTEGER,
    CONSTRAINT "RepairStatusLog_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepairPhoto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repairId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepairPhoto_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brandId" INTEGER,
    "modelId" INTEGER,
    "caliberId" INTEGER,
    "customerType" TEXT,
    "minPrice" INTEGER NOT NULL,
    "maxPrice" INTEGER NOT NULL,
    "suggestedWorkName" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Estimate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "repairId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "technicalFee" INTEGER NOT NULL DEFAULT 0,
    "mechanicCost" INTEGER NOT NULL DEFAULT 0,
    "partsTotal" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "shipping" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Estimate_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstimateItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "estimateId" INTEGER NOT NULL,
    "itemName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartsMaster" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "brandId" INTEGER,
    "caliberId" INTEGER,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "name_jp" TEXT NOT NULL,
    "partNumber" TEXT,
    "category" TEXT NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "latestCostYen" INTEGER NOT NULL DEFAULT 0,
    "retailPrice" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "supplier" TEXT,
    "notes" TEXT,
    CONSTRAINT "PartsMaster_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PartsMaster_caliberId_fkey" FOREIGN KEY ("caliberId") REFERENCES "Caliber" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slipNumber" TEXT NOT NULL,
    "issuedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceNumber" TEXT NOT NULL,
    "issuedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "paymentDueDate" DATETIME,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EstimateDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "estimateNumber" TEXT NOT NULL,
    "issuedDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerId" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EstimateDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE INDEX "Watch_brandId_serialNumber_idx" ON "Watch"("brandId", "serialNumber");

-- CreateIndex
CREATE INDEX "Watch_serialNumber_idx" ON "Watch"("serialNumber");

-- CreateIndex
CREATE INDEX "Watch_brandId_modelId_idx" ON "Watch"("brandId", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "Repair_uuid_key" ON "Repair"("uuid");

-- CreateIndex
CREATE UNIQUE INDEX "Repair_inquiryNumber_key" ON "Repair"("inquiryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_repairId_key" ON "Estimate"("repairId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_slipNumber_key" ON "DeliveryNote"("slipNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateDocument_estimateNumber_key" ON "EstimateDocument"("estimateNumber");

