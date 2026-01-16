# Clock Repair System (Web Migration)

## 🟢 Latest Status (2026-01-16)
**Progress Rate: 40%**

### ✅ Verification Results (Phase 1.5 - 2.0)
- **Image Optimization Engine**: UI now supports Drag & Drop and **Direct Mobile Camera**.
  - Auto-compresses any image to **WebP (<500KB)** in the browser before upload.
  - Validated batch processing with progress bar.

### 🧪 Mock Simulation (Phase 2.1)
- **Full Flow verified**:
  - `Repair Entry` -> `Photo Compression` -> `Simulated R2 Upload` -> `DB Registration`.
  - Confirmed photos are linked to Repairs in the database with correct filenames.

### ✅ Verification Results (Phase 1.5 - 2.0)
- **Backend Logic**:
  - **Time Estimation**: "Caliber 4130" correctly auto-estimated as 120 minutes.
- **Priority Scoring**:
  - VIP Customers (Rank 5) verified to receive high baseline score (500+).
  - Urgent Deadlines (<3 days) verified to override rank, scoring >1100 points.

### 📘 Phase 2 Design (Completed)
Detailed design for scaling to 50,000 records has been documented:
- **Search**: Designed "Prefix Indexes" for instant serial number search.
- **Image Optimization**: Defined auto-compression logic (WebP, <500KB) to minimize R2 costs.
- **Storage**: Adopted `YYYY/MM/UUID` structure for efficient file management.

---

FileMakerからWebアプリ（Next.js + XServer）への移行プロジェクト。

## 📊 Project Status
**Current Phase:** Phase 1.5 - API & Logic Implementation

### 🚀 Progress
- [x] **Phase 1: Database & Basic UI**
  - [x] DB Schema Design (MySQL/Prisma)
  - [x] UI: Repair Entry Form (Premium Dense Layout)
  - [x] UI: Customer Registration Form
- [ ] **Phase 1.5: API & Logic**
  - [ ] Priority Scoring Engine (Implemented, Testing...)
  - [ ] Time Estimation Logic (Caliber-based)
  - [ ] Repair Registration API

## 🛠 Tech Stack
- **Frontend:** Next.js (App Router), Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** MySQL (Production), SQLite (Dev)
- **ORM:** Prisma

## 📝 Recent Updates
- Implemented "Smart Input" UI for Watch Brands/Models.
- Designed "Priority Scoring" algorithm based on deadline and customer rank.
