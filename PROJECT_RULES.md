# PROJECT RULES & CONSTRAINTS

This file defines the absolute rules and constraints for the "Spinning Voyager" project.
The AI assistant MUST read and follow these rules before making any changes.

## 1. CUSTOMER & PARTNER MANAGEMENT
### Global Rules
- **Formatting:** All customer IDs must follow the format `[PREFIX]-[SEQ]`.
- **Sequence:** The sequence number (SEQ) must be auto-incremented for each prefix group.

### Business Partners (B2B)
- **Registration:** When registering a new business partner, the user MUST be able to manually input a unique Prefix (1-3 chars).
  - Example: "TRUST" -> Prefix "T" -> ID "T-001"
  - Example: "Brand Ichiban" -> Prefix "BR" -> ID "BR-001"
- **UI:** The registration dialog must have a field for "Prefix".

### Individual Customers (B2C)
- **Prefix:** Fixed to **"C"** (Customer).
- **ID Generation:** All individual customers share the same prefix "C".
  - Example: "C-001", "C-002", "C-003"...
- **UI:** The prefix input should be hidden or disabled (fixed to "C") for individual customers.

## 2. UI/UX PRESERVATION
- **Critical Features:** Do NOT remove existing buttons, dialogs, or input fields unless explicitly instructed.
- **Registration Flow:** The "New Registration" button next to the customer name input is critical. It must always trigger the detailed registration dialog (`QuickRegisterDialog`).
- **Layout Changes:** When refactoring layouts (e.g., to 3 columns), ensure all original functional elements are preserved and relocated, not deleted.

## 3. COMMANDS
- **"ルール追加" (Add Rule):** When the user prompts "ルール追加", add the new rule to this file immediately.

## 4. DATABASE SCHEMA (IMMUTABLE REFERENCE)
The following schema defines the core data structure. Any changes to this schema must be explicitly requested.

```prisma
// 1. User & Customer Management
model Customer {
  id           Int      @id @default(autoincrement())
  type         String   // 'individual', 'business'
  rank         Int      @default(1) // 1 to 5
  name         String
  kana         String?
  companyName  String?
  zipCode      String?
  address      String?
  phone        String?
  email        String?
  lineId       String?
  passwordHash String?
  createdAt    DateTime @default(now())
  
  // Partner Extensions
  isPartner    Boolean  @default(false)
  prefix       String?  // e.g. "T", "JK"
  currentSeq   Int      @default(0) // Last issued sequence (e.g. 100)
  
  // Document Sequences
  seqEstimate  Int      @default(0)
  seqDelivery  Int      @default(0)
  seqInvoice   Int      @default(0)
  
  watches       Watch[]
  repairs       Repair[]
  deliveryNotes DeliveryNote[]
  invoices      Invoice[]
  estimateDocuments EstimateDocument[]
}

// 3. Repair & Watch
model Repair {
  id                   Int       @id @default(autoincrement())
  uuid                 String    @unique @default(uuid())
  inquiryNumber        String    @unique // T-001
  customerId           Int
  watchId              Int
  partnerRef           String?   // Manual Partner Mgmt No
  accessories          String?   // JSON or CSV of checked items
  
  receptionDate        DateTime  @default(now())
  status               String    // 'reception', 'diagnosing', etc.
  approvalStatus       String    @default("pending")
  
  // Scheduling & Priority Logic
  priorityScore        Int       @default(0)
  scheduledDate        DateTime?
  estimatedWorkMinutes Int       @default(0)
  
  workSummary          String?
  internalNotes        String?
  // SEO Flags
  isPublicB2C          Boolean   @default(false)
  isPublicB2B          Boolean   @default(false)
  publicTitle          String?
  publicDescription    String?
  endUserName          String?   // B2B End User Name
  
  deliveryDateExpected DateTime?
  deliveryDateActual   DateTime?
  
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  customer Customer          @relation(fields: [customerId], references: [id])
  watch    Watch             @relation(fields: [watchId], references: [id])
  logs     RepairStatusLog[]
  photos   RepairPhoto[]
  estimate Estimate?
}
```
