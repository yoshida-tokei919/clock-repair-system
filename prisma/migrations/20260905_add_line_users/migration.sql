-- Store LINE webhook users independently from Customer.lineId until an explicit
-- customer-linking workflow is introduced.
CREATE TABLE "LineUser" (
    "id" SERIAL NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "firstReceivedAt" TIMESTAMP(3) NOT NULL,
    "lastReceivedAt" TIMESTAMP(3) NOT NULL,
    "lastEventType" TEXT NOT NULL,
    "linkedCustomerId" INTEGER,
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineUser_lineUserId_key" ON "LineUser"("lineUserId");
CREATE INDEX "LineUser_linkedCustomerId_idx" ON "LineUser"("linkedCustomerId");
CREATE INDEX "LineUser_lastReceivedAt_idx" ON "LineUser"("lastReceivedAt");

ALTER TABLE "LineUser"
    ADD CONSTRAINT "LineUser_linkedCustomerId_fkey"
    FOREIGN KEY ("linkedCustomerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
