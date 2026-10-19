ALTER TABLE "public"."Customer" ADD COLUMN "lineContactCustomerId" INTEGER;

CREATE INDEX "Customer_lineContactCustomerId_idx" ON "public"."Customer"("lineContactCustomerId");

ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_lineContactCustomerId_fkey"
  FOREIGN KEY ("lineContactCustomerId") REFERENCES "public"."Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
