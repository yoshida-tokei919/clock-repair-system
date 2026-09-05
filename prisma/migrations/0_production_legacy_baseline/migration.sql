--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

-- public schema already exists in a PostgreSQL database; no CREATE SCHEMA is emitted.


--
-- Name: PublicCasePublishStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."PublicCasePublishStatus" AS ENUM (
    'HIDDEN',
    'READY',
    'PUBLISHED',
    'ARCHIVED'
);


--
-- Name: PublicCaseReviewStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."PublicCaseReviewStatus" AS ENUM (
    'DRAFT',
    'NEEDS_REVIEW',
    'APPROVED',
    'REJECTED'
);


--
-- Name: PublicCaseSourceType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."PublicCaseSourceType" AS ENUM (
    'FMP',
    'WEB_APP'
);


--
-- Name: PublicCaseWarningSeverity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."PublicCaseWarningSeverity" AS ENUM (
    'CRITICAL',
    'REVIEW',
    'INFO'
);


--
-- Name: RepairLineItemType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."RepairLineItemType" AS ENUM (
    'LABOR',
    'PART'
);


--
-- Name: RepairWorkReviewStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."RepairWorkReviewStatus" AS ENUM (
    'APPROVED',
    'REVIEW',
    'REJECTED'
);


--
-- Name: RepairWorkSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."RepairWorkSource" AS ENUM (
    'MANUAL',
    'USER_INPUT',
    'FMP',
    'SEED'
);


--
-- Name: RepairWorkType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."RepairWorkType" AS ENUM (
    'INTERNAL',
    'EXTERNAL'
);


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: Admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Admin" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "passwordHash" "text" NOT NULL,
    "role" "text" DEFAULT 'admin'::"text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Admin_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Admin_id_seq" OWNED BY "public"."Admin"."id";


--
-- Name: Brand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Brand" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "name_jp" "text" NOT NULL,
    "kana" "text",
    "initialChar" "text"
);


--
-- Name: Brand_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Brand_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Brand_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Brand_id_seq" OWNED BY "public"."Brand"."id";


--
-- Name: Caliber; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Caliber" (
    "id" integer NOT NULL,
    "brandId" integer,
    "name" "text" NOT NULL,
    "name_en" "text",
    "name_jp" "text",
    "movementType" "text",
    "standardWorkMinutes" integer DEFAULT 60 NOT NULL
);


--
-- Name: Caliber_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Caliber_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Caliber_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Caliber_id_seq" OWNED BY "public"."Caliber"."id";


--
-- Name: Customer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Customer" (
    "id" integer NOT NULL,
    "type" "text" NOT NULL,
    "rank" integer DEFAULT 1 NOT NULL,
    "name" "text" NOT NULL,
    "kana" "text",
    "companyName" "text",
    "zipCode" "text",
    "address" "text",
    "phone" "text",
    "email" "text",
    "lineId" "text",
    "passwordHash" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "isPartner" boolean DEFAULT false NOT NULL,
    "prefix" "text",
    "currentSeq" integer DEFAULT 0 NOT NULL,
    "seqEstimate" integer DEFAULT 0 NOT NULL,
    "seqDelivery" integer DEFAULT 0 NOT NULL,
    "seqInvoice" integer DEFAULT 0 NOT NULL,
    "seqWarranty" integer DEFAULT 0 NOT NULL
);


--
-- Name: Customer_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Customer_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Customer_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Customer_id_seq" OWNED BY "public"."Customer"."id";


--
-- Name: DeliveryNote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."DeliveryNote" (
    "id" integer NOT NULL,
    "slipNumber" "text" NOT NULL,
    "issuedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "customerId" integer NOT NULL,
    "totalAmount" integer DEFAULT 0 NOT NULL,
    "taxAmount" integer DEFAULT 0 NOT NULL
);


--
-- Name: DeliveryNote_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."DeliveryNote_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: DeliveryNote_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."DeliveryNote_id_seq" OWNED BY "public"."DeliveryNote"."id";


--
-- Name: Estimate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Estimate" (
    "id" integer NOT NULL,
    "repairId" integer NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "issuedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "technicalFee" integer DEFAULT 0 NOT NULL,
    "mechanicCost" integer DEFAULT 0 NOT NULL,
    "partsTotal" integer DEFAULT 0 NOT NULL,
    "discountAmount" integer DEFAULT 0 NOT NULL,
    "shipping" integer DEFAULT 0 NOT NULL,
    "taxAmount" integer DEFAULT 0 NOT NULL,
    "totalAmount" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


--
-- Name: EstimateDocument; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."EstimateDocument" (
    "id" integer NOT NULL,
    "estimateNumber" "text" NOT NULL,
    "issuedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "publicToken" "text",
    "publicTokenCreatedAt" timestamp(3) without time zone,
    "currentPdfFileId" integer,
    "customerId" integer NOT NULL,
    "totalAmount" integer DEFAULT 0 NOT NULL,
    "taxAmount" integer DEFAULT 0 NOT NULL
);


--
-- Name: EstimateDocument_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."EstimateDocument_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: EstimateDocument_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."EstimateDocument_id_seq" OWNED BY "public"."EstimateDocument"."id";


--
-- Name: EstimateItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."EstimateItem" (
    "id" integer NOT NULL,
    "estimateId" integer NOT NULL,
    "itemName" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unitPrice" integer NOT NULL,
    "type" "text" NOT NULL,
    "orderStatus" "text" DEFAULT 'pending'::"text",
    "orderedAt" timestamp(3) without time zone,
    "partsMasterId" integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: EstimateItem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."EstimateItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: EstimateItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."EstimateItem_id_seq" OWNED BY "public"."EstimateItem"."id";


--
-- Name: EstimatePdfFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."EstimatePdfFile" (
    "id" integer NOT NULL,
    "estimateDocumentId" integer NOT NULL,
    "customerId" integer,
    "storageKey" "text" NOT NULL,
    "fileName" "text" NOT NULL,
    "contentType" "text" DEFAULT 'application/pdf'::"text" NOT NULL,
    "fileSize" integer,
    "hash" "text",
    "version" integer NOT NULL,
    "status" "text" DEFAULT 'current'::"text" NOT NULL,
    "generatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "generatedBy" "text",
    "sentAt" timestamp(3) without time zone,
    "approvedAt" timestamp(3) without time zone,
    "supersededAt" timestamp(3) without time zone
);


--
-- Name: EstimatePdfFile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."EstimatePdfFile_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: EstimatePdfFile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."EstimatePdfFile_id_seq" OWNED BY "public"."EstimatePdfFile"."id";


--
-- Name: Estimate_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Estimate_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Estimate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Estimate_id_seq" OWNED BY "public"."Estimate"."id";


--
-- Name: Invoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Invoice" (
    "id" integer NOT NULL,
    "invoiceNumber" "text" NOT NULL,
    "issuedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "billingMonth" "text",
    "publicToken" "text",
    "publicTokenCreatedAt" timestamp(3) without time zone,
    "currentPdfFileId" integer,
    "customerId" integer NOT NULL,
    "totalAmount" integer DEFAULT 0 NOT NULL,
    "taxAmount" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "paymentDueDate" timestamp(3) without time zone,
    "sentAt" timestamp(3) without time zone
);


--
-- Name: InvoicePdfFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."InvoicePdfFile" (
    "id" integer NOT NULL,
    "invoiceId" integer NOT NULL,
    "customerId" integer,
    "storageKey" "text" NOT NULL,
    "fileName" "text" NOT NULL,
    "contentType" "text" DEFAULT 'application/pdf'::"text" NOT NULL,
    "fileSize" integer,
    "hash" "text",
    "version" integer NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "generatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "generatedBy" "text",
    "sentAt" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    "supersededAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: InvoicePdfFile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."InvoicePdfFile_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: InvoicePdfFile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."InvoicePdfFile_id_seq" OWNED BY "public"."InvoicePdfFile"."id";


--
-- Name: Invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Invoice_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Invoice_id_seq" OWNED BY "public"."Invoice"."id";


--
-- Name: Model; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Model" (
    "id" integer NOT NULL,
    "brandId" integer NOT NULL,
    "name" "text" NOT NULL,
    "name_en" "text",
    "name_jp" "text" NOT NULL
);


--
-- Name: Model_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Model_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Model_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Model_id_seq" OWNED BY "public"."Model"."id";


--
-- Name: OrderRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."OrderRequest" (
    "id" integer NOT NULL,
    "partsMasterId" integer,
    "partNameJp" "text" NOT NULL,
    "partNameEn" "text",
    "partRefs" "text",
    "cousinsNumber" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "supplierId" integer,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "searchWordJp" "text",
    "searchWordEn" "text",
    "repairId" integer,
    "notes" "text",
    "orderedAt" timestamp(3) without time zone,
    "receivedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: OrderRequest_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."OrderRequest_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: OrderRequest_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."OrderRequest_id_seq" OWNED BY "public"."OrderRequest"."id";


--
-- Name: PartCategoryMaster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PartCategoryMaster" (
    "id" "text" NOT NULL,
    "key" "text" NOT NULL,
    "partType" "text" NOT NULL,
    "nameJa" "text" NOT NULL,
    "nameEn" "text",
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PartGradeMaster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PartGradeMaster" (
    "id" "text" NOT NULL,
    "key" "text" NOT NULL,
    "nameJa" "text" NOT NULL,
    "nameEn" "text",
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PartNameMaster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PartNameMaster" (
    "id" "text" NOT NULL,
    "key" "text" NOT NULL,
    "categoryId" "text" NOT NULL,
    "partType" "text" NOT NULL,
    "nameJa" "text" NOT NULL,
    "nameEn" "text",
    "displayJa" "text",
    "displayEn" "text",
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PartsMaster; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PartsMaster" (
    "id" integer NOT NULL,
    "standardPartNameId" "text",
    "gradeId" "text",
    "partType" "text",
    "category" "text" NOT NULL,
    "subcategory" "text",
    "brandId" integer,
    "modelId" integer,
    "watchRefs" "text",
    "caliberId" integer,
    "baseCaliberId" integer,
    "movementMakerId" integer,
    "baseMakerId" integer,
    "name" "text" NOT NULL,
    "name_en" "text",
    "name_jp" "text" NOT NULL,
    "partRefs" "text",
    "cousinsNumber" "text",
    "grade" "text",
    "size" "text",
    "photoKey" "text",
    "notes" "text",
    "notes2" "text",
    "costCurrency" "text" DEFAULT 'JPY'::"text" NOT NULL,
    "costOriginal" double precision DEFAULT 0 NOT NULL,
    "latestCostYen" integer DEFAULT 0 NOT NULL,
    "markupRate" double precision DEFAULT 1.3 NOT NULL,
    "retailPrice" integer DEFAULT 0 NOT NULL,
    "stockQuantity" integer DEFAULT 0 NOT NULL,
    "minStockAlert" integer DEFAULT 0 NOT NULL,
    "minStockAlertEnabled" boolean DEFAULT false NOT NULL,
    "location" "text",
    "supplierId" integer
);


--
-- Name: PartsMaster_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."PartsMaster_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PartsMaster_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."PartsMaster_id_seq" OWNED BY "public"."PartsMaster"."id";


--
-- Name: PricingRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PricingRule" (
    "id" integer NOT NULL,
    "brandId" integer,
    "modelId" integer,
    "caliberId" integer,
    "customerType" "text",
    "minPrice" integer NOT NULL,
    "maxPrice" integer NOT NULL,
    "suggestedWorkName" "text" NOT NULL,
    "notes" "text",
    "repairWorkNameId" integer,
    "repairWorkCategoryId" integer,
    "repairWorkActionId" integer,
    "targetPartNameId" "text",
    "detailLabel" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PricingRule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."PricingRule_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PricingRule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."PricingRule_id_seq" OWNED BY "public"."PricingRule"."id";


--
-- Name: PublicCase; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PublicCase" (
    "id" integer NOT NULL,
    "sourceType" "public"."PublicCaseSourceType" NOT NULL,
    "sourceRepairId" "text",
    "repairId" integer,
    "receivedDate" timestamp(3) without time zone,
    "brandName" "text",
    "brandNameKana" "text",
    "brandDisplayName" "text",
    "modelName" "text",
    "ref" "text",
    "caliber" "text",
    "searchText" "text",
    "reviewStatus" "public"."PublicCaseReviewStatus" DEFAULT 'DRAFT'::"public"."PublicCaseReviewStatus" NOT NULL,
    "b2bPublishStatus" "public"."PublicCasePublishStatus" DEFAULT 'HIDDEN'::"public"."PublicCasePublishStatus" NOT NULL,
    "b2cPublishStatus" "public"."PublicCasePublishStatus" DEFAULT 'HIDDEN'::"public"."PublicCasePublishStatus" NOT NULL,
    "b2bPublishedAt" timestamp(3) without time zone,
    "b2cPublishedAt" timestamp(3) without time zone,
    "b2bTitle" "text",
    "b2cTitle" "text",
    "b2bSummary" "jsonb",
    "b2cSummary" "jsonb",
    "publicTags" "jsonb",
    "showPriceB2b" boolean DEFAULT true NOT NULL,
    "showPriceB2c" boolean DEFAULT false NOT NULL,
    "internalLaborTotal" integer,
    "externalLaborTotal" integer,
    "outsourcedTotal" integer,
    "partsTotal" integer,
    "totalAmount" integer,
    "warnings" "jsonb",
    "excludeReasons" "jsonb",
    "sourceSnapshot" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PublicCaseImage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PublicCaseImage" (
    "id" integer NOT NULL,
    "publicCaseId" integer NOT NULL,
    "storagePath" "text",
    "url" "text",
    "altText" "text",
    "caption" "text",
    "imageRole" "text",
    "isPrimary" boolean DEFAULT false NOT NULL,
    "reviewStatus" "public"."PublicCaseReviewStatus" DEFAULT 'DRAFT'::"public"."PublicCaseReviewStatus" NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PublicCaseImage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."PublicCaseImage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PublicCaseImage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."PublicCaseImage_id_seq" OWNED BY "public"."PublicCaseImage"."id";


--
-- Name: PublicCasePartItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PublicCasePartItem" (
    "id" integer NOT NULL,
    "publicCaseId" integer NOT NULL,
    "relatedWorkItemId" integer,
    "sourceArea" "text" NOT NULL,
    "sourceSlot" integer,
    "sourceText" "text" NOT NULL,
    "normalizedSourceText" "text" NOT NULL,
    "displayName" "text",
    "price" integer,
    "showPriceB2b" boolean DEFAULT true NOT NULL,
    "showPriceB2c" boolean DEFAULT false NOT NULL,
    "relationStatus" "text" DEFAULT 'UNLINKED'::"text" NOT NULL,
    "reviewStatus" "public"."PublicCaseReviewStatus" DEFAULT 'DRAFT'::"public"."PublicCaseReviewStatus" NOT NULL,
    "excludeReason" "text",
    "metadata" "jsonb",
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PublicCasePartItem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."PublicCasePartItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PublicCasePartItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."PublicCasePartItem_id_seq" OWNED BY "public"."PublicCasePartItem"."id";


--
-- Name: PublicCaseWarning; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PublicCaseWarning" (
    "id" integer NOT NULL,
    "publicCaseId" integer NOT NULL,
    "code" "text" NOT NULL,
    "severity" "public"."PublicCaseWarningSeverity" NOT NULL,
    "message" "text",
    "target" "text",
    "metadata" "jsonb",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: PublicCaseWarning_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."PublicCaseWarning_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PublicCaseWarning_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."PublicCaseWarning_id_seq" OWNED BY "public"."PublicCaseWarning"."id";


--
-- Name: PublicCaseWorkItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."PublicCaseWorkItem" (
    "id" integer NOT NULL,
    "publicCaseId" integer NOT NULL,
    "sourceArea" "text" NOT NULL,
    "sourceSlot" integer,
    "sourceText" "text" NOT NULL,
    "normalizedSourceText" "text" NOT NULL,
    "isRuleMatched" boolean DEFAULT false NOT NULL,
    "isPublishable" boolean DEFAULT false NOT NULL,
    "reviewStatus" "public"."PublicCaseReviewStatus" DEFAULT 'DRAFT'::"public"."PublicCaseReviewStatus" NOT NULL,
    "excludeReason" "text",
    "normalizedWorkName" "text",
    "b2bDisplayName" "text",
    "b2cDisplayName" "text",
    "laborPrice" integer,
    "showPriceB2b" boolean DEFAULT true NOT NULL,
    "showPriceB2c" boolean DEFAULT false NOT NULL,
    "category" "text",
    "partName" "text",
    "action" "text",
    "actionDetail" "text",
    "attributes" "jsonb",
    "ruleSnapshot" "jsonb",
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: PublicCaseWorkItem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."PublicCaseWorkItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PublicCaseWorkItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."PublicCaseWorkItem_id_seq" OWNED BY "public"."PublicCaseWorkItem"."id";


--
-- Name: PublicCase_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."PublicCase_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PublicCase_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."PublicCase_id_seq" OWNED BY "public"."PublicCase"."id";


--
-- Name: Repair; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Repair" (
    "id" integer NOT NULL,
    "uuid" "text" NOT NULL,
    "publicToken" "text",
    "publicTokenCreatedAt" timestamp(3) without time zone,
    "inquiryNumber" "text" NOT NULL,
    "customerId" integer NOT NULL,
    "watchId" integer NOT NULL,
    "movementMakerId" integer,
    "movementCaliberId" integer,
    "baseMovementMakerId" integer,
    "baseMovementCaliberId" integer,
    "partnerRef" "text",
    "accessories" "text",
    "receptionDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "status" "text" NOT NULL,
    "approvalStatus" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approvalDate" timestamp(3) without time zone,
    "priorityScore" integer DEFAULT 0 NOT NULL,
    "scheduledDate" timestamp(3) without time zone,
    "estimatedWorkMinutes" integer DEFAULT 0 NOT NULL,
    "workSummary" "text",
    "internalNotes" "text",
    "customerNote" "text",
    "isPublicB2C" boolean DEFAULT false NOT NULL,
    "isPublicB2B" boolean DEFAULT false NOT NULL,
    "publicTitle" "text",
    "publicDescription" "text",
    "endUserName" "text",
    "deliveryDateExpected" timestamp(3) without time zone,
    "deliveryDateActual" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deliveryNoteId" integer,
    "invoiceId" integer,
    "estimateDocumentId" integer,
    "warrantyId" integer
);


--
-- Name: RepairCustomerMessage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RepairCustomerMessage" (
    "id" integer NOT NULL,
    "repairId" integer NOT NULL,
    "body" "text" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "readAt" timestamp(3) without time zone,
    "senderType" "text" DEFAULT 'partner'::"text" NOT NULL
);


--
-- Name: RepairCustomerMessage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."RepairCustomerMessage_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RepairCustomerMessage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."RepairCustomerMessage_id_seq" OWNED BY "public"."RepairCustomerMessage"."id";


--
-- Name: RepairLineItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RepairLineItem" (
    "id" integer NOT NULL,
    "repairId" integer NOT NULL,
    "lineType" "public"."RepairLineItemType" NOT NULL,
    "partsMasterId" integer,
    "pricingRuleId" integer,
    "repairWorkCategoryId" integer,
    "repairWorkActionId" integer,
    "targetPartNameId" "text",
    "relatedWorkLineItemId" integer,
    "itemNameSnapshot" "text" NOT NULL,
    "estimateDisplayNameSnapshot" "text",
    "b2bDisplayNameSnapshot" "text",
    "b2cDisplayNameSnapshot" "text",
    "gradeNameSnapshot" "text",
    "notesForCustomerSnapshot" "text",
    "detailLabelSnapshot" "text",
    "categoryNameSnapshot" "text",
    "targetPartNameSnapshot" "text",
    "actionNameSnapshot" "text",
    "quantity" integer DEFAULT 1 NOT NULL,
    "unitPrice" integer DEFAULT 0 NOT NULL,
    "amount" integer DEFAULT 0 NOT NULL,
    "showPriceB2b" boolean DEFAULT false NOT NULL,
    "showPriceB2c" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "internalMemo" "text",
    "customerMemo" "text",
    "publicMemo" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RepairLineItem_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."RepairLineItem_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RepairLineItem_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."RepairLineItem_id_seq" OWNED BY "public"."RepairLineItem"."id";


--
-- Name: RepairPhoto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RepairPhoto" (
    "id" integer NOT NULL,
    "repairId" integer NOT NULL,
    "category" "text" NOT NULL,
    "storageKey" "text" NOT NULL,
    "fileName" "text",
    "mimeType" "text",
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: RepairPhoto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."RepairPhoto_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RepairPhoto_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."RepairPhoto_id_seq" OWNED BY "public"."RepairPhoto"."id";


--
-- Name: RepairStatusLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RepairStatusLog" (
    "id" integer NOT NULL,
    "repairId" integer NOT NULL,
    "status" "text" NOT NULL,
    "changedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "changedBy" integer
);


--
-- Name: RepairStatusLog_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."RepairStatusLog_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RepairStatusLog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."RepairStatusLog_id_seq" OWNED BY "public"."RepairStatusLog"."id";


--
-- Name: RepairWorkAction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RepairWorkAction" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "displayName" "text" NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RepairWorkAction_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."RepairWorkAction_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RepairWorkAction_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."RepairWorkAction_id_seq" OWNED BY "public"."RepairWorkAction"."id";


--
-- Name: RepairWorkCategory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RepairWorkCategory" (
    "id" integer NOT NULL,
    "repairType" "public"."RepairWorkType" NOT NULL,
    "parentId" integer,
    "name" "text" NOT NULL,
    "displayName" "text" NOT NULL,
    "description" "text",
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RepairWorkCategory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."RepairWorkCategory_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RepairWorkCategory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."RepairWorkCategory_id_seq" OWNED BY "public"."RepairWorkCategory"."id";


--
-- Name: RepairWorkName; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."RepairWorkName" (
    "id" integer NOT NULL,
    "repairType" "public"."RepairWorkType" NOT NULL,
    "categoryId" integer NOT NULL,
    "targetPartNameId" "text",
    "actionId" integer,
    "detailLabel" "text",
    "standardName" "text" NOT NULL,
    "b2bDisplayName" "text",
    "b2cDisplayName" "text",
    "description" "text",
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "source" "public"."RepairWorkSource" DEFAULT 'MANUAL'::"public"."RepairWorkSource" NOT NULL,
    "reviewStatus" "public"."RepairWorkReviewStatus" DEFAULT 'APPROVED'::"public"."RepairWorkReviewStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: RepairWorkName_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."RepairWorkName_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: RepairWorkName_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."RepairWorkName_id_seq" OWNED BY "public"."RepairWorkName"."id";


--
-- Name: Repair_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Repair_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Repair_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Repair_id_seq" OWNED BY "public"."Repair"."id";


--
-- Name: Supplier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Supplier" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "url" "text",
    "isOnline" boolean DEFAULT true NOT NULL,
    "notes" "text"
);


--
-- Name: Supplier_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Supplier_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Supplier_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Supplier_id_seq" OWNED BY "public"."Supplier"."id";


--
-- Name: Warranty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Warranty" (
    "id" integer NOT NULL,
    "warrantyNumber" "text" NOT NULL,
    "issuedDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "guaranteeStart" timestamp(3) without time zone NOT NULL,
    "guaranteeEnd" timestamp(3) without time zone NOT NULL,
    "customerId" integer NOT NULL
);


--
-- Name: Warranty_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Warranty_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Warranty_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Warranty_id_seq" OWNED BY "public"."Warranty"."id";


--
-- Name: Watch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."Watch" (
    "id" integer NOT NULL,
    "brandId" integer NOT NULL,
    "modelId" integer NOT NULL,
    "referenceId" integer,
    "caliberId" integer,
    "serialNumber" "text",
    "customerId" integer NOT NULL,
    "accessories" "text"
);


--
-- Name: WatchReference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."WatchReference" (
    "id" integer NOT NULL,
    "modelId" integer NOT NULL,
    "name" "text" NOT NULL,
    "caliberId" integer
);


--
-- Name: WatchReference_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."WatchReference_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WatchReference_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."WatchReference_id_seq" OWNED BY "public"."WatchReference"."id";


--
-- Name: Watch_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."Watch_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Watch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."Watch_id_seq" OWNED BY "public"."Watch"."id";


--
-- Name: Admin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Admin" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Admin_id_seq"'::"regclass");


--
-- Name: Brand id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Brand" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Brand_id_seq"'::"regclass");


--
-- Name: Caliber id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Caliber" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Caliber_id_seq"'::"regclass");


--
-- Name: Customer id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Customer" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Customer_id_seq"'::"regclass");


--
-- Name: DeliveryNote id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."DeliveryNote" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."DeliveryNote_id_seq"'::"regclass");


--
-- Name: Estimate id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Estimate" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Estimate_id_seq"'::"regclass");


--
-- Name: EstimateDocument id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateDocument" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."EstimateDocument_id_seq"'::"regclass");


--
-- Name: EstimateItem id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateItem" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."EstimateItem_id_seq"'::"regclass");


--
-- Name: EstimatePdfFile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimatePdfFile" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."EstimatePdfFile_id_seq"'::"regclass");


--
-- Name: Invoice id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Invoice" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Invoice_id_seq"'::"regclass");


--
-- Name: InvoicePdfFile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."InvoicePdfFile" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."InvoicePdfFile_id_seq"'::"regclass");


--
-- Name: Model id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Model" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Model_id_seq"'::"regclass");


--
-- Name: OrderRequest id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OrderRequest" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."OrderRequest_id_seq"'::"regclass");


--
-- Name: PartsMaster id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."PartsMaster_id_seq"'::"regclass");


--
-- Name: PricingRule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PricingRule" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."PricingRule_id_seq"'::"regclass");


--
-- Name: PublicCase id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCase" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."PublicCase_id_seq"'::"regclass");


--
-- Name: PublicCaseImage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseImage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."PublicCaseImage_id_seq"'::"regclass");


--
-- Name: PublicCasePartItem id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCasePartItem" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."PublicCasePartItem_id_seq"'::"regclass");


--
-- Name: PublicCaseWarning id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseWarning" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."PublicCaseWarning_id_seq"'::"regclass");


--
-- Name: PublicCaseWorkItem id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseWorkItem" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."PublicCaseWorkItem_id_seq"'::"regclass");


--
-- Name: Repair id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Repair_id_seq"'::"regclass");


--
-- Name: RepairCustomerMessage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairCustomerMessage" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RepairCustomerMessage_id_seq"'::"regclass");


--
-- Name: RepairLineItem id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RepairLineItem_id_seq"'::"regclass");


--
-- Name: RepairPhoto id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairPhoto" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RepairPhoto_id_seq"'::"regclass");


--
-- Name: RepairStatusLog id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairStatusLog" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RepairStatusLog_id_seq"'::"regclass");


--
-- Name: RepairWorkAction id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkAction" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RepairWorkAction_id_seq"'::"regclass");


--
-- Name: RepairWorkCategory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkCategory" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RepairWorkCategory_id_seq"'::"regclass");


--
-- Name: RepairWorkName id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkName" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."RepairWorkName_id_seq"'::"regclass");


--
-- Name: Supplier id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Supplier" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Supplier_id_seq"'::"regclass");


--
-- Name: Warranty id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Warranty" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Warranty_id_seq"'::"regclass");


--
-- Name: Watch id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Watch" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."Watch_id_seq"'::"regclass");


--
-- Name: WatchReference id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WatchReference" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."WatchReference_id_seq"'::"regclass");


--
-- Name: Admin Admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Admin"
    ADD CONSTRAINT "Admin_pkey" PRIMARY KEY ("id");


--
-- Name: Brand Brand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Brand"
    ADD CONSTRAINT "Brand_pkey" PRIMARY KEY ("id");


--
-- Name: Caliber Caliber_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Caliber"
    ADD CONSTRAINT "Caliber_pkey" PRIMARY KEY ("id");


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY ("id");


--
-- Name: DeliveryNote DeliveryNote_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."DeliveryNote"
    ADD CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id");


--
-- Name: EstimateDocument EstimateDocument_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateDocument"
    ADD CONSTRAINT "EstimateDocument_pkey" PRIMARY KEY ("id");


--
-- Name: EstimateItem EstimateItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateItem"
    ADD CONSTRAINT "EstimateItem_pkey" PRIMARY KEY ("id");


--
-- Name: EstimatePdfFile EstimatePdfFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimatePdfFile"
    ADD CONSTRAINT "EstimatePdfFile_pkey" PRIMARY KEY ("id");


--
-- Name: Estimate Estimate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Estimate"
    ADD CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id");


--
-- Name: InvoicePdfFile InvoicePdfFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."InvoicePdfFile"
    ADD CONSTRAINT "InvoicePdfFile_pkey" PRIMARY KEY ("id");


--
-- Name: Invoice Invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id");


--
-- Name: Model Model_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Model"
    ADD CONSTRAINT "Model_pkey" PRIMARY KEY ("id");


--
-- Name: OrderRequest OrderRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OrderRequest"
    ADD CONSTRAINT "OrderRequest_pkey" PRIMARY KEY ("id");


--
-- Name: PartCategoryMaster PartCategoryMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartCategoryMaster"
    ADD CONSTRAINT "PartCategoryMaster_pkey" PRIMARY KEY ("id");


--
-- Name: PartGradeMaster PartGradeMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartGradeMaster"
    ADD CONSTRAINT "PartGradeMaster_pkey" PRIMARY KEY ("id");


--
-- Name: PartNameMaster PartNameMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartNameMaster"
    ADD CONSTRAINT "PartNameMaster_pkey" PRIMARY KEY ("id");


--
-- Name: PartsMaster PartsMaster_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_pkey" PRIMARY KEY ("id");


--
-- Name: PricingRule PricingRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PricingRule"
    ADD CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id");


--
-- Name: PublicCaseImage PublicCaseImage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseImage"
    ADD CONSTRAINT "PublicCaseImage_pkey" PRIMARY KEY ("id");


--
-- Name: PublicCasePartItem PublicCasePartItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCasePartItem"
    ADD CONSTRAINT "PublicCasePartItem_pkey" PRIMARY KEY ("id");


--
-- Name: PublicCaseWarning PublicCaseWarning_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseWarning"
    ADD CONSTRAINT "PublicCaseWarning_pkey" PRIMARY KEY ("id");


--
-- Name: PublicCaseWorkItem PublicCaseWorkItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseWorkItem"
    ADD CONSTRAINT "PublicCaseWorkItem_pkey" PRIMARY KEY ("id");


--
-- Name: PublicCase PublicCase_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCase"
    ADD CONSTRAINT "PublicCase_pkey" PRIMARY KEY ("id");


--
-- Name: RepairCustomerMessage RepairCustomerMessage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairCustomerMessage"
    ADD CONSTRAINT "RepairCustomerMessage_pkey" PRIMARY KEY ("id");


--
-- Name: RepairLineItem RepairLineItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_pkey" PRIMARY KEY ("id");


--
-- Name: RepairPhoto RepairPhoto_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairPhoto"
    ADD CONSTRAINT "RepairPhoto_pkey" PRIMARY KEY ("id");


--
-- Name: RepairStatusLog RepairStatusLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairStatusLog"
    ADD CONSTRAINT "RepairStatusLog_pkey" PRIMARY KEY ("id");


--
-- Name: RepairWorkAction RepairWorkAction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkAction"
    ADD CONSTRAINT "RepairWorkAction_pkey" PRIMARY KEY ("id");


--
-- Name: RepairWorkCategory RepairWorkCategory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkCategory"
    ADD CONSTRAINT "RepairWorkCategory_pkey" PRIMARY KEY ("id");


--
-- Name: RepairWorkName RepairWorkName_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkName"
    ADD CONSTRAINT "RepairWorkName_pkey" PRIMARY KEY ("id");


--
-- Name: Repair Repair_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_pkey" PRIMARY KEY ("id");


--
-- Name: Supplier Supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Supplier"
    ADD CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id");


--
-- Name: Warranty Warranty_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Warranty"
    ADD CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id");


--
-- Name: WatchReference WatchReference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WatchReference"
    ADD CONSTRAINT "WatchReference_pkey" PRIMARY KEY ("id");


--
-- Name: Watch Watch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Watch"
    ADD CONSTRAINT "Watch_pkey" PRIMARY KEY ("id");


--
-- Name: Admin_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Admin_email_key" ON "public"."Admin" USING "btree" ("email");


--
-- Name: Brand_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Brand_name_key" ON "public"."Brand" USING "btree" ("name");


--
-- Name: DeliveryNote_slipNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DeliveryNote_slipNumber_key" ON "public"."DeliveryNote" USING "btree" ("slipNumber");


--
-- Name: EstimateDocument_currentPdfFileId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EstimateDocument_currentPdfFileId_key" ON "public"."EstimateDocument" USING "btree" ("currentPdfFileId");


--
-- Name: EstimateDocument_estimateNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EstimateDocument_estimateNumber_key" ON "public"."EstimateDocument" USING "btree" ("estimateNumber");


--
-- Name: EstimateDocument_publicToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EstimateDocument_publicToken_key" ON "public"."EstimateDocument" USING "btree" ("publicToken");


--
-- Name: EstimatePdfFile_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EstimatePdfFile_customerId_idx" ON "public"."EstimatePdfFile" USING "btree" ("customerId");


--
-- Name: EstimatePdfFile_estimateDocumentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EstimatePdfFile_estimateDocumentId_idx" ON "public"."EstimatePdfFile" USING "btree" ("estimateDocumentId");


--
-- Name: EstimatePdfFile_estimateDocumentId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "EstimatePdfFile_estimateDocumentId_version_key" ON "public"."EstimatePdfFile" USING "btree" ("estimateDocumentId", "version");


--
-- Name: EstimatePdfFile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EstimatePdfFile_status_idx" ON "public"."EstimatePdfFile" USING "btree" ("status");


--
-- Name: Estimate_repairId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Estimate_repairId_key" ON "public"."Estimate" USING "btree" ("repairId");


--
-- Name: InvoicePdfFile_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InvoicePdfFile_customerId_idx" ON "public"."InvoicePdfFile" USING "btree" ("customerId");


--
-- Name: InvoicePdfFile_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InvoicePdfFile_invoiceId_idx" ON "public"."InvoicePdfFile" USING "btree" ("invoiceId");


--
-- Name: InvoicePdfFile_invoiceId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "InvoicePdfFile_invoiceId_version_key" ON "public"."InvoicePdfFile" USING "btree" ("invoiceId", "version");


--
-- Name: InvoicePdfFile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "InvoicePdfFile_status_idx" ON "public"."InvoicePdfFile" USING "btree" ("status");


--
-- Name: Invoice_currentPdfFileId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_currentPdfFileId_key" ON "public"."Invoice" USING "btree" ("currentPdfFileId");


--
-- Name: Invoice_invoiceNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "public"."Invoice" USING "btree" ("invoiceNumber");


--
-- Name: Invoice_publicToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Invoice_publicToken_key" ON "public"."Invoice" USING "btree" ("publicToken");


--
-- Name: PartCategoryMaster_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PartCategoryMaster_key_key" ON "public"."PartCategoryMaster" USING "btree" ("key");


--
-- Name: PartCategoryMaster_partType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartCategoryMaster_partType_idx" ON "public"."PartCategoryMaster" USING "btree" ("partType");


--
-- Name: PartCategoryMaster_partType_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartCategoryMaster_partType_sortOrder_idx" ON "public"."PartCategoryMaster" USING "btree" ("partType", "sortOrder");


--
-- Name: PartGradeMaster_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PartGradeMaster_key_key" ON "public"."PartGradeMaster" USING "btree" ("key");


--
-- Name: PartGradeMaster_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartGradeMaster_sortOrder_idx" ON "public"."PartGradeMaster" USING "btree" ("sortOrder");


--
-- Name: PartNameMaster_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartNameMaster_categoryId_idx" ON "public"."PartNameMaster" USING "btree" ("categoryId");


--
-- Name: PartNameMaster_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PartNameMaster_key_key" ON "public"."PartNameMaster" USING "btree" ("key");


--
-- Name: PartNameMaster_partType_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartNameMaster_partType_categoryId_idx" ON "public"."PartNameMaster" USING "btree" ("partType", "categoryId");


--
-- Name: PartNameMaster_partType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartNameMaster_partType_idx" ON "public"."PartNameMaster" USING "btree" ("partType");


--
-- Name: PartNameMaster_partType_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartNameMaster_partType_sortOrder_idx" ON "public"."PartNameMaster" USING "btree" ("partType", "sortOrder");


--
-- Name: PartsMaster_gradeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartsMaster_gradeId_idx" ON "public"."PartsMaster" USING "btree" ("gradeId");


--
-- Name: PartsMaster_standardPartNameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PartsMaster_standardPartNameId_idx" ON "public"."PartsMaster" USING "btree" ("standardPartNameId");


--
-- Name: PricingRule_brandId_customerType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_brandId_customerType_idx" ON "public"."PricingRule" USING "btree" ("brandId", "customerType");


--
-- Name: PricingRule_brandId_modelId_caliberId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_brandId_modelId_caliberId_idx" ON "public"."PricingRule" USING "btree" ("brandId", "modelId", "caliberId");


--
-- Name: PricingRule_brandId_repairWorkCategoryId_targetPartNameId_r_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_brandId_repairWorkCategoryId_targetPartNameId_r_idx" ON "public"."PricingRule" USING "btree" ("brandId", "repairWorkCategoryId", "targetPartNameId", "repairWorkActionId");


--
-- Name: PricingRule_brandId_repairWorkNameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_brandId_repairWorkNameId_idx" ON "public"."PricingRule" USING "btree" ("brandId", "repairWorkNameId");


--
-- Name: PricingRule_repairWorkActionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_repairWorkActionId_idx" ON "public"."PricingRule" USING "btree" ("repairWorkActionId");


--
-- Name: PricingRule_repairWorkCategoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_repairWorkCategoryId_idx" ON "public"."PricingRule" USING "btree" ("repairWorkCategoryId");


--
-- Name: PricingRule_repairWorkCategoryId_repairWorkActionId_targetP_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_repairWorkCategoryId_repairWorkActionId_targetP_idx" ON "public"."PricingRule" USING "btree" ("repairWorkCategoryId", "repairWorkActionId", "targetPartNameId");


--
-- Name: PricingRule_repairWorkNameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_repairWorkNameId_idx" ON "public"."PricingRule" USING "btree" ("repairWorkNameId");


--
-- Name: PricingRule_targetPartNameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PricingRule_targetPartNameId_idx" ON "public"."PricingRule" USING "btree" ("targetPartNameId");


--
-- Name: PublicCaseImage_publicCaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseImage_publicCaseId_idx" ON "public"."PublicCaseImage" USING "btree" ("publicCaseId");


--
-- Name: PublicCasePartItem_publicCaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCasePartItem_publicCaseId_idx" ON "public"."PublicCasePartItem" USING "btree" ("publicCaseId");


--
-- Name: PublicCasePartItem_relatedWorkItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCasePartItem_relatedWorkItemId_idx" ON "public"."PublicCasePartItem" USING "btree" ("relatedWorkItemId");


--
-- Name: PublicCasePartItem_sourceArea_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCasePartItem_sourceArea_idx" ON "public"."PublicCasePartItem" USING "btree" ("sourceArea");


--
-- Name: PublicCaseWarning_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseWarning_code_idx" ON "public"."PublicCaseWarning" USING "btree" ("code");


--
-- Name: PublicCaseWarning_publicCaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseWarning_publicCaseId_idx" ON "public"."PublicCaseWarning" USING "btree" ("publicCaseId");


--
-- Name: PublicCaseWarning_severity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseWarning_severity_idx" ON "public"."PublicCaseWarning" USING "btree" ("severity");


--
-- Name: PublicCaseWorkItem_isPublishable_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseWorkItem_isPublishable_idx" ON "public"."PublicCaseWorkItem" USING "btree" ("isPublishable");


--
-- Name: PublicCaseWorkItem_normalizedSourceText_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseWorkItem_normalizedSourceText_idx" ON "public"."PublicCaseWorkItem" USING "btree" ("normalizedSourceText");


--
-- Name: PublicCaseWorkItem_publicCaseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseWorkItem_publicCaseId_idx" ON "public"."PublicCaseWorkItem" USING "btree" ("publicCaseId");


--
-- Name: PublicCaseWorkItem_sourceArea_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCaseWorkItem_sourceArea_idx" ON "public"."PublicCaseWorkItem" USING "btree" ("sourceArea");


--
-- Name: PublicCase_b2bPublishStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_b2bPublishStatus_idx" ON "public"."PublicCase" USING "btree" ("b2bPublishStatus");


--
-- Name: PublicCase_b2cPublishStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_b2cPublishStatus_idx" ON "public"."PublicCase" USING "btree" ("b2cPublishStatus");


--
-- Name: PublicCase_brandNameKana_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_brandNameKana_idx" ON "public"."PublicCase" USING "btree" ("brandNameKana");


--
-- Name: PublicCase_brandName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_brandName_idx" ON "public"."PublicCase" USING "btree" ("brandName");


--
-- Name: PublicCase_caliber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_caliber_idx" ON "public"."PublicCase" USING "btree" ("caliber");


--
-- Name: PublicCase_modelName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_modelName_idx" ON "public"."PublicCase" USING "btree" ("modelName");


--
-- Name: PublicCase_ref_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_ref_idx" ON "public"."PublicCase" USING "btree" ("ref");


--
-- Name: PublicCase_repairId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_repairId_idx" ON "public"."PublicCase" USING "btree" ("repairId");


--
-- Name: PublicCase_reviewStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PublicCase_reviewStatus_idx" ON "public"."PublicCase" USING "btree" ("reviewStatus");


--
-- Name: PublicCase_sourceType_sourceRepairId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PublicCase_sourceType_sourceRepairId_key" ON "public"."PublicCase" USING "btree" ("sourceType", "sourceRepairId");


--
-- Name: RepairCustomerMessage_repairId_readAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairCustomerMessage_repairId_readAt_idx" ON "public"."RepairCustomerMessage" USING "btree" ("repairId", "readAt");


--
-- Name: RepairLineItem_lineType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_lineType_idx" ON "public"."RepairLineItem" USING "btree" ("lineType");


--
-- Name: RepairLineItem_partsMasterId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_partsMasterId_idx" ON "public"."RepairLineItem" USING "btree" ("partsMasterId");


--
-- Name: RepairLineItem_pricingRuleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_pricingRuleId_idx" ON "public"."RepairLineItem" USING "btree" ("pricingRuleId");


--
-- Name: RepairLineItem_relatedWorkLineItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_relatedWorkLineItemId_idx" ON "public"."RepairLineItem" USING "btree" ("relatedWorkLineItemId");


--
-- Name: RepairLineItem_repairId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_repairId_idx" ON "public"."RepairLineItem" USING "btree" ("repairId");


--
-- Name: RepairLineItem_repairId_lineType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_repairId_lineType_idx" ON "public"."RepairLineItem" USING "btree" ("repairId", "lineType");


--
-- Name: RepairLineItem_repairId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_repairId_sortOrder_idx" ON "public"."RepairLineItem" USING "btree" ("repairId", "sortOrder");


--
-- Name: RepairLineItem_repairWorkActionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_repairWorkActionId_idx" ON "public"."RepairLineItem" USING "btree" ("repairWorkActionId");


--
-- Name: RepairLineItem_repairWorkCategoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_repairWorkCategoryId_idx" ON "public"."RepairLineItem" USING "btree" ("repairWorkCategoryId");


--
-- Name: RepairLineItem_repairWorkCategoryId_repairWorkActionId_targ_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_repairWorkCategoryId_repairWorkActionId_targ_idx" ON "public"."RepairLineItem" USING "btree" ("repairWorkCategoryId", "repairWorkActionId", "targetPartNameId");


--
-- Name: RepairLineItem_targetPartNameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairLineItem_targetPartNameId_idx" ON "public"."RepairLineItem" USING "btree" ("targetPartNameId");


--
-- Name: RepairWorkAction_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RepairWorkAction_name_key" ON "public"."RepairWorkAction" USING "btree" ("name");


--
-- Name: RepairWorkCategory_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairWorkCategory_parentId_idx" ON "public"."RepairWorkCategory" USING "btree" ("parentId");


--
-- Name: RepairWorkCategory_repairType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairWorkCategory_repairType_idx" ON "public"."RepairWorkCategory" USING "btree" ("repairType");


--
-- Name: RepairWorkCategory_repairType_parentId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "RepairWorkCategory_repairType_parentId_name_key" ON "public"."RepairWorkCategory" USING "btree" ("repairType", "parentId", "name");


--
-- Name: RepairWorkName_actionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairWorkName_actionId_idx" ON "public"."RepairWorkName" USING "btree" ("actionId");


--
-- Name: RepairWorkName_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairWorkName_categoryId_idx" ON "public"."RepairWorkName" USING "btree" ("categoryId");


--
-- Name: RepairWorkName_repairType_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairWorkName_repairType_idx" ON "public"."RepairWorkName" USING "btree" ("repairType");


--
-- Name: RepairWorkName_reviewStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairWorkName_reviewStatus_idx" ON "public"."RepairWorkName" USING "btree" ("reviewStatus");


--
-- Name: RepairWorkName_targetPartNameId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RepairWorkName_targetPartNameId_idx" ON "public"."RepairWorkName" USING "btree" ("targetPartNameId");


--
-- Name: Repair_inquiryNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Repair_inquiryNumber_key" ON "public"."Repair" USING "btree" ("inquiryNumber");


--
-- Name: Repair_publicToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Repair_publicToken_key" ON "public"."Repair" USING "btree" ("publicToken");


--
-- Name: Repair_uuid_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Repair_uuid_key" ON "public"."Repair" USING "btree" ("uuid");


--
-- Name: Supplier_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Supplier_name_key" ON "public"."Supplier" USING "btree" ("name");


--
-- Name: Warranty_warrantyNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Warranty_warrantyNumber_key" ON "public"."Warranty" USING "btree" ("warrantyNumber");


--
-- Name: Watch_brandId_modelId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Watch_brandId_modelId_idx" ON "public"."Watch" USING "btree" ("brandId", "modelId");


--
-- Name: Watch_brandId_serialNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Watch_brandId_serialNumber_idx" ON "public"."Watch" USING "btree" ("brandId", "serialNumber");


--
-- Name: Watch_serialNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Watch_serialNumber_idx" ON "public"."Watch" USING "btree" ("serialNumber");


--
-- Name: Caliber Caliber_brandId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Caliber"
    ADD CONSTRAINT "Caliber_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DeliveryNote DeliveryNote_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."DeliveryNote"
    ADD CONSTRAINT "DeliveryNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EstimateDocument EstimateDocument_currentPdfFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateDocument"
    ADD CONSTRAINT "EstimateDocument_currentPdfFileId_fkey" FOREIGN KEY ("currentPdfFileId") REFERENCES "public"."EstimatePdfFile"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EstimateDocument EstimateDocument_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateDocument"
    ADD CONSTRAINT "EstimateDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EstimateItem EstimateItem_estimateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateItem"
    ADD CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "public"."Estimate"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EstimateItem EstimateItem_partsMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimateItem"
    ADD CONSTRAINT "EstimateItem_partsMasterId_fkey" FOREIGN KEY ("partsMasterId") REFERENCES "public"."PartsMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EstimatePdfFile EstimatePdfFile_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimatePdfFile"
    ADD CONSTRAINT "EstimatePdfFile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EstimatePdfFile EstimatePdfFile_estimateDocumentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."EstimatePdfFile"
    ADD CONSTRAINT "EstimatePdfFile_estimateDocumentId_fkey" FOREIGN KEY ("estimateDocumentId") REFERENCES "public"."EstimateDocument"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Estimate Estimate_repairId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Estimate"
    ADD CONSTRAINT "Estimate_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "public"."Repair"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: InvoicePdfFile InvoicePdfFile_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."InvoicePdfFile"
    ADD CONSTRAINT "InvoicePdfFile_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InvoicePdfFile InvoicePdfFile_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."InvoicePdfFile"
    ADD CONSTRAINT "InvoicePdfFile_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Invoice Invoice_currentPdfFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Invoice"
    ADD CONSTRAINT "Invoice_currentPdfFileId_fkey" FOREIGN KEY ("currentPdfFileId") REFERENCES "public"."InvoicePdfFile"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Invoice Invoice_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Invoice"
    ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Model Model_brandId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Model"
    ADD CONSTRAINT "Model_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OrderRequest OrderRequest_partsMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OrderRequest"
    ADD CONSTRAINT "OrderRequest_partsMasterId_fkey" FOREIGN KEY ("partsMasterId") REFERENCES "public"."PartsMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrderRequest OrderRequest_repairId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OrderRequest"
    ADD CONSTRAINT "OrderRequest_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "public"."Repair"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrderRequest OrderRequest_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."OrderRequest"
    ADD CONSTRAINT "OrderRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartNameMaster PartNameMaster_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartNameMaster"
    ADD CONSTRAINT "PartNameMaster_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."PartCategoryMaster"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PartsMaster PartsMaster_baseCaliberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_baseCaliberId_fkey" FOREIGN KEY ("baseCaliberId") REFERENCES "public"."Caliber"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_baseMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_baseMakerId_fkey" FOREIGN KEY ("baseMakerId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_brandId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_caliberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_caliberId_fkey" FOREIGN KEY ("caliberId") REFERENCES "public"."Caliber"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_gradeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "public"."PartGradeMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_modelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "public"."Model"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_movementMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_movementMakerId_fkey" FOREIGN KEY ("movementMakerId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_standardPartNameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_standardPartNameId_fkey" FOREIGN KEY ("standardPartNameId") REFERENCES "public"."PartNameMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PartsMaster PartsMaster_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PartsMaster"
    ADD CONSTRAINT "PartsMaster_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."Supplier"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PricingRule PricingRule_repairWorkActionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PricingRule"
    ADD CONSTRAINT "PricingRule_repairWorkActionId_fkey" FOREIGN KEY ("repairWorkActionId") REFERENCES "public"."RepairWorkAction"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PricingRule PricingRule_repairWorkCategoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PricingRule"
    ADD CONSTRAINT "PricingRule_repairWorkCategoryId_fkey" FOREIGN KEY ("repairWorkCategoryId") REFERENCES "public"."RepairWorkCategory"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PricingRule PricingRule_repairWorkNameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PricingRule"
    ADD CONSTRAINT "PricingRule_repairWorkNameId_fkey" FOREIGN KEY ("repairWorkNameId") REFERENCES "public"."RepairWorkName"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PricingRule PricingRule_targetPartNameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PricingRule"
    ADD CONSTRAINT "PricingRule_targetPartNameId_fkey" FOREIGN KEY ("targetPartNameId") REFERENCES "public"."PartNameMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PublicCaseImage PublicCaseImage_publicCaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseImage"
    ADD CONSTRAINT "PublicCaseImage_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "public"."PublicCase"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PublicCasePartItem PublicCasePartItem_publicCaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCasePartItem"
    ADD CONSTRAINT "PublicCasePartItem_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "public"."PublicCase"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PublicCasePartItem PublicCasePartItem_relatedWorkItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCasePartItem"
    ADD CONSTRAINT "PublicCasePartItem_relatedWorkItemId_fkey" FOREIGN KEY ("relatedWorkItemId") REFERENCES "public"."PublicCaseWorkItem"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PublicCaseWarning PublicCaseWarning_publicCaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseWarning"
    ADD CONSTRAINT "PublicCaseWarning_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "public"."PublicCase"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PublicCaseWorkItem PublicCaseWorkItem_publicCaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCaseWorkItem"
    ADD CONSTRAINT "PublicCaseWorkItem_publicCaseId_fkey" FOREIGN KEY ("publicCaseId") REFERENCES "public"."PublicCase"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PublicCase PublicCase_repairId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."PublicCase"
    ADD CONSTRAINT "PublicCase_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "public"."Repair"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairCustomerMessage RepairCustomerMessage_repairId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairCustomerMessage"
    ADD CONSTRAINT "RepairCustomerMessage_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "public"."Repair"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RepairLineItem RepairLineItem_partsMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_partsMasterId_fkey" FOREIGN KEY ("partsMasterId") REFERENCES "public"."PartsMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairLineItem RepairLineItem_pricingRuleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "public"."PricingRule"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairLineItem RepairLineItem_relatedWorkLineItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_relatedWorkLineItemId_fkey" FOREIGN KEY ("relatedWorkLineItemId") REFERENCES "public"."RepairLineItem"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairLineItem RepairLineItem_repairId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "public"."Repair"("id") ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RepairLineItem RepairLineItem_repairWorkActionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_repairWorkActionId_fkey" FOREIGN KEY ("repairWorkActionId") REFERENCES "public"."RepairWorkAction"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairLineItem RepairLineItem_repairWorkCategoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_repairWorkCategoryId_fkey" FOREIGN KEY ("repairWorkCategoryId") REFERENCES "public"."RepairWorkCategory"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairLineItem RepairLineItem_targetPartNameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairLineItem"
    ADD CONSTRAINT "RepairLineItem_targetPartNameId_fkey" FOREIGN KEY ("targetPartNameId") REFERENCES "public"."PartNameMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairPhoto RepairPhoto_repairId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairPhoto"
    ADD CONSTRAINT "RepairPhoto_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "public"."Repair"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RepairStatusLog RepairStatusLog_repairId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairStatusLog"
    ADD CONSTRAINT "RepairStatusLog_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "public"."Repair"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RepairWorkCategory RepairWorkCategory_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkCategory"
    ADD CONSTRAINT "RepairWorkCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."RepairWorkCategory"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairWorkName RepairWorkName_actionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkName"
    ADD CONSTRAINT "RepairWorkName_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "public"."RepairWorkAction"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: RepairWorkName RepairWorkName_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkName"
    ADD CONSTRAINT "RepairWorkName_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."RepairWorkCategory"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RepairWorkName RepairWorkName_targetPartNameId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."RepairWorkName"
    ADD CONSTRAINT "RepairWorkName_targetPartNameId_fkey" FOREIGN KEY ("targetPartNameId") REFERENCES "public"."PartNameMaster"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_baseMovementCaliberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_baseMovementCaliberId_fkey" FOREIGN KEY ("baseMovementCaliberId") REFERENCES "public"."Caliber"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_baseMovementMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_baseMovementMakerId_fkey" FOREIGN KEY ("baseMovementMakerId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Repair Repair_deliveryNoteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "public"."DeliveryNote"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_estimateDocumentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_estimateDocumentId_fkey" FOREIGN KEY ("estimateDocumentId") REFERENCES "public"."EstimateDocument"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_movementCaliberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_movementCaliberId_fkey" FOREIGN KEY ("movementCaliberId") REFERENCES "public"."Caliber"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_movementMakerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_movementMakerId_fkey" FOREIGN KEY ("movementMakerId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_warrantyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "public"."Warranty"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Repair Repair_watchId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Repair"
    ADD CONSTRAINT "Repair_watchId_fkey" FOREIGN KEY ("watchId") REFERENCES "public"."Watch"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Warranty Warranty_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Warranty"
    ADD CONSTRAINT "Warranty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: WatchReference WatchReference_caliberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WatchReference"
    ADD CONSTRAINT "WatchReference_caliberId_fkey" FOREIGN KEY ("caliberId") REFERENCES "public"."Caliber"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WatchReference WatchReference_modelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."WatchReference"
    ADD CONSTRAINT "WatchReference_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "public"."Model"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Watch Watch_brandId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Watch"
    ADD CONSTRAINT "Watch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."Brand"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Watch Watch_caliberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Watch"
    ADD CONSTRAINT "Watch_caliberId_fkey" FOREIGN KEY ("caliberId") REFERENCES "public"."Caliber"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Watch Watch_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Watch"
    ADD CONSTRAINT "Watch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Watch Watch_modelId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Watch"
    ADD CONSTRAINT "Watch_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "public"."Model"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Watch Watch_referenceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."Watch"
    ADD CONSTRAINT "Watch_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "public"."WatchReference"("id") ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

-- pg_dump clears search_path at the beginning. Prisma records the migration in
-- the same session after this SQL finishes, so restore the default schema.
SELECT pg_catalog.set_config('search_path', 'public', false);


