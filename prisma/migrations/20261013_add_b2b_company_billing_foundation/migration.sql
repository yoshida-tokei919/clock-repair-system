-- Task207B: explicit company membership and one optional member billing destination.
-- Existing store Customer foreign keys on Repair, DeliveryNote, Invoice and Shipment are unchanged.
CREATE TABLE public."B2BCompany" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "billingCustomerId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE public."B2BCompanyMembership" (
  "companyId" INTEGER NOT NULL,
  "customerId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "B2BCompanyMembership_pkey" PRIMARY KEY ("companyId", "customerId"),
  CONSTRAINT "B2BCompanyMembership_customerId_key" UNIQUE ("customerId"),
  CONSTRAINT "B2BCompanyMembership_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES public."B2BCompany"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "B2BCompanyMembership_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES public."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE public."B2BCompany"
  ADD CONSTRAINT "B2BCompany_billingMembership_fkey"
  FOREIGN KEY ("id", "billingCustomerId")
  REFERENCES public."B2BCompanyMembership"("companyId", "customerId")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

-- A member must remain B2B even if Customer.type is subsequently edited elsewhere.
CREATE FUNCTION public."enforce_b2b_company_member"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Customer"
    WHERE "id" = NEW."customerId" AND "type" = 'business'
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'B2B company member must be a business Customer';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "B2BCompanyMembership_business_only"
BEFORE INSERT OR UPDATE OF "customerId" ON public."B2BCompanyMembership"
FOR EACH ROW EXECUTE FUNCTION public."enforce_b2b_company_member"();

CREATE FUNCTION public."prevent_b2b_member_type_change"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."type" <> 'business' AND EXISTS (
    SELECT 1 FROM public."B2BCompanyMembership" WHERE "customerId" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Remove B2B company membership before changing Customer type';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Customer_b2b_member_type_guard"
BEFORE UPDATE OF "type" ON public."Customer"
FOR EACH ROW EXECUTE FUNCTION public."prevent_b2b_member_type_change"();

-- Server-only Prisma/direct Postgres tables. No Data API role needs access.
ALTER TABLE public."B2BCompany" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."B2BCompanyMembership" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."B2BCompany", public."B2BCompanyMembership"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public."B2BCompany_id_seq"
  FROM PUBLIC, anon, authenticated, service_role;
