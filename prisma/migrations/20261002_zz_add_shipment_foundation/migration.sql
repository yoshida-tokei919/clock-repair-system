-- Task199A: one physical parcel per Shipment, with a many-to-many Repair link.
CREATE TYPE public."ShipmentDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE public."ShipmentStatus" AS ENUM (
  'DRAFT', 'READY', 'LABEL_ISSUED', 'AWAITING_ACCEPTANCE', 'SHIPPED',
  'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'EXCEPTION', 'CANCELLED'
);
CREATE TYPE public."ShipmentHandoffMethod" AS ENUM ('PICKUP', 'COUNTER_DROP_OFF', 'OTHER');

CREATE TABLE public."Shipment" (
  "id" SERIAL NOT NULL,
  "customerId" INTEGER NOT NULL,
  "direction" public."ShipmentDirection" NOT NULL DEFAULT 'OUTBOUND',
  "status" public."ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
  "carrierCode" TEXT,
  "serviceCode" TEXT,
  "handoffMethod" public."ShipmentHandoffMethod",
  "plannedShipDate" DATE,
  "labelIssuedAt" TIMESTAMP(3),
  "handoffRequestedAt" TIMESTAMP(3),
  "actualShippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "trackingNumber" TEXT,
  "destinationRecipientName" TEXT NOT NULL,
  "destinationPostalCode" TEXT NOT NULL,
  "destinationPrefecture" TEXT NOT NULL,
  "destinationCity" TEXT NOT NULL,
  "destinationStreet" TEXT NOT NULL,
  "destinationBuilding" TEXT,
  "destinationPhone" TEXT NOT NULL,
  "requestedDeliveryDate" DATE,
  "requestedDeliveryTimeSlot" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE public."ShipmentRepair" (
  "shipmentId" INTEGER NOT NULL,
  "repairId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShipmentRepair_pkey" PRIMARY KEY ("shipmentId", "repairId")
);

CREATE INDEX "Shipment_customerId_plannedShipDate_idx"
  ON public."Shipment"("customerId", "plannedShipDate");
CREATE INDEX "Shipment_status_plannedShipDate_idx"
  ON public."Shipment"("status", "plannedShipDate");
CREATE INDEX "Shipment_trackingNumber_idx"
  ON public."Shipment"("trackingNumber");
CREATE INDEX "ShipmentRepair_repairId_idx"
  ON public."ShipmentRepair"("repairId");

ALTER TABLE public."Shipment" ADD CONSTRAINT "Shipment_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES public."Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."ShipmentRepair" ADD CONSTRAINT "ShipmentRepair_shipmentId_fkey"
  FOREIGN KEY ("shipmentId") REFERENCES public."Shipment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE public."ShipmentRepair" ADD CONSTRAINT "ShipmentRepair_repairId_fkey"
  FOREIGN KEY ("repairId") REFERENCES public."Repair"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only Prisma access; no Data API grants or policies.
ALTER TABLE public."Shipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ShipmentRepair" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Shipment", public."ShipmentRepair"
  FROM anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."Shipment_id_seq"
  FROM anon, authenticated, service_role;
