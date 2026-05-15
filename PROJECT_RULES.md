# PROJECT RULES & CONSTRAINTS

This file defines the absolute rules and constraints for the "Spinning Voyager" project.
The AI assistant MUST read and follow these rules before making any changes.

## 1. CUSTOMER & PARTNER MANAGEMENT
### Global Rules
- **Formatting:** All customer IDs must follow the format `[PREFIX]-[SEQ]`.
- **Sequence:** The sequence number (SEQ) must be auto-incremented for each prefix group.
- **Current Numbering Source:** `Customer.type` is the source of truth for B2B/B2C. Do not use `Customer.isPartner` for numbering or B2B/B2C checks.
- **B2C Repair Inquiry Numbers:** B2C prefix is fixed to `C`; B2C repair inquiry numbers start from `C-10000`, then `C-10001`, `C-10002`, and so on.
- **B2B Repair Inquiry Numbers:** B2B repair inquiry numbers use each business partner's manually entered prefix and start from `001`, e.g. `T-001`, `T-002`.
- **B2B Prefix Requirements:** B2B prefix is required, must be unique in real operation, must stop registration when empty or duplicated, must not be inferred automatically, and must never be hardcoded to `P`.

### Business Partners (B2B)
- **Registration:** When registering a new business partner, the user MUST be able to manually input a unique Prefix (1-3 chars).
  - Example: "TRUST" -> Prefix "T" -> ID "T-001"
  - Example: "じゅえりー工房" -> Prefix "J" -> ID "J-001"
  - Example: "Brand Ichiban" -> Prefix "BR" -> ID "BR-001"
- **UI:** The registration dialog must have a field for "Prefix".
- **Prefix Rules:** B2B prefixes must be entered by the user, must be unique in practice, and must not be inferred automatically or hardcoded to "P".
- **Numbering:** B2B repair numbers start from `001` per customer record, e.g. `T-001`, `T-002`.

### Individual Customers (B2C)
- **Prefix:** Fixed to **"C"** (Customer).
- **ID Generation:** All individual customers share the same prefix "C", but B2C repair numbers start from **C-10000**, not C-001.
  - Example: "C-10000", "C-10001", "C-10002"...
  - Reason: "C-001" may look like the business has just started if visible to individual customers.
- **UI:** The prefix input should be hidden or disabled (fixed to "C") for individual customers.
- **Implementation:** `Customer.type` is the source of truth for B2B/B2C. Do not use `Customer.isPartner` for numbering or B2B/B2C checks. B2C prefix duplication is allowed; B2B prefix duplication is not.

## 2. REPAIR STATUS WORKFLOW
- **Status Workflow Source:** Repair status names, transitions, triggers, and automation limits are defined in `docs/design/repair-status-workflow-rules.md`.
- **Do Not Change Casually:** Do not add, remove, rename, or reinterpret repair statuses without an explicit request.
- **Business Logic Location:** n8n may detect external events, but repair status transition decisions must stay in the app-side API/service logic.
- **Human Confirmation Required:** Do not auto-confirm received parts from email alone, do not fully automate part assignment, and do not auto-transition cancellation or hold statuses.

## 3. UI/UX PRESERVATION & LOCALIZATION
- **完全日本語化の徹底**: UI上のあらゆる表記から英語を排除し、日本語のみとする。
  - `顧客情報 (Client)` → `顧客情報`
  - `見積中 (Diagnosing)` → `見積中`
  - 理由の如何を問わず、括弧書きの英語併記も禁止する。プログラム内部の識別子（reception等）が画面に漏れ出さないよう、必ず変換処理を通すこと。
- **パフォーマンスとシンプルさの追求**:
  - 不要な装飾や重い処理を避け、FileMakerのような軽快な動作を目指す。
  - データベースからの取得データは必要最小限に絞り、不要な通信（Includeの多用）を抑制する。
- **日本時間（Asia/Tokyo）の徹底**: 日時・タイムスタンプは常に日本時間で表示する。
- **Critical Features:** Do NOT remove existing buttons, dialogs, or input fields unless explicitly instructed.
- **Registration Flow:** The "New Registration" button next to the customer name input is critical. It must always trigger the detailed registration dialog (`QuickRegisterDialog`).
- **Layout Changes:** When refactoring layouts (e.g., to 3 columns), ensure all original functional elements are preserved and relocated, not deleted.

## 4. MASTER DATA PERSISTENCE
- **Automatic Registration:** When a new repair is created or updated, any "Work Items" (Labor) or "Parts" entered in the estimate section MUST be automatically registered/updated in the `PricingRule` (Work Master) and `PartsMaster` tables respectively if they don't already exist for that specific watch (Brand/Model/Caliber).
- **Naming Priority:** Always display Japanese names (`nameJp`) for Brands and Models if available. Fall back to `name` or English only if `nameJp` is empty.
- **Ref/Model Management:** Model and Reference (Ref) fields are mandatory for accurate part matching.

## 5. COMMANDS
- **"ルール追加" (Add Rule):** When the user prompts "ルール追加", add the new rule to this file immediately.

## 6. DATABASE SCHEMA (IMMUTABLE REFERENCE)
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
## 6. 内装・外装の定義と修理ロジック (Definitions & Logic)
- **絶対定義（内装と外装の境界線）**:
  - **内装修理・内装部品 (Internal)**: 
    - 定義：**「時計のムーブメント（機械体）」に対する全ての修理作業および部品。**
    - 具体例：分解掃除（OH）、ゼンマイ交換、歯車交換、注油、歩度調整など。
    - 依存先：原則として `[ムーブメント/キャリバー]` に依存する。
  - **外装修理・外装部品 (External)**: 
    - 定義：**「ムーブメント以外」に対する全ての修理作業および部品。**
    - 具体例：ケース、ブレスレット、ガラス、リューズ、文字盤、針、パッキン交換、研磨など。
    - 依存先：原則として `[モデル/Ref（型番）]` に依存する。

- **自動転記（Lookup）の掟（2段階階層方式）**:
  - 修理項目・金額の検索時、以下の2段階で最適な価格を特定すること。
    - **第1段階（個別価格）**: `[ブランド]` + `[キャリバー]` + `[作業/部品名]` を検索。
    - **第2段階（標準価格）**: 第1段階で見つからない場合、自動的に `[ムーブメント製造元（ETA等）]` + `[キャリバー]` + `[作業/部品名]` を検索し、共通価格を適用する。
  - **部品の紐付け管理**:
    - **内装部品（ゼンマイ、ローター、機械部品等）**: 優先的に `[ブランド+キャリバー]`、なければ `[製造元+キャリバー]` に紐付ける。
    - **外装部品（文字盤、針、外装関連等）**: 外装パーツは本来すべてRef（型番）専用であるが、メーカー公表資料がないため、以下の優先順位で実務上の「目合わせ・経験」に基づき検索する。
      1. `[ブランド]` + `[モデル名]` + `[型番/Ref]` + `[部品名]` + `[備考/仕様]`
      2. `[ブランド]` + `[モデル名]` + `[部品名]` + `[備考/仕様]`
      3. `[ブランド]` + `[部品名]` + `[備考/仕様]`
    - **ブランド不問（汎用部品）**: パッキン、汎用ガラス、リューズ、バネ棒等のブランドに依存しない部品。
      - `[ブランド：なし/共通]` + `[部品名]` + `[備考/仕様（サイズ、形状等）]` でマスタを管理・検索する。
  - **部品の属性による厳密な識別**:
    - 同一名称の部品でも、**「備考/仕様」**（サイズ：31×0.7、色、純正/汎用、新品/中古等）が異なる場合は**別のマスタデータ**として扱い、仕入れ値や在庫を個別に管理する。
    - 特に外装の汎用部品は、ブランド名ではなく**「サイズや仕様」が検索の主キー**となる。
- **入力の尊重**: 候補は出すが、勝手に選択しない。ユーザーが選ぶか、入力して欄を離れた（Blur）時に初めて値として確定させる。
- **自動学習機能**: 手入力された「部品名＋備考/仕様」およびその金額は、修理保存時に**自動的にマスタ（次回からの正解）として保存・更新**すること。

## 7. AIの動作と品質の掟 (AI OPERATION RULES)
- **爆速レスポンス（平坦化インデックス）**: 
  - データの整合性は「ムーブメント製造元」を分けるなどの正規化を行うが、ユーザーへの応答速度を最優先するため、ブラウザ側のメモリ上ではこれらを**「一発で引けるシンプルな価格索引（平坦化）」**に変換して保持すること。
  - Lookupや検索はサーバー通信を待たずに0.1秒以下で行うこと。
- **作業前の「掟」確認義務**: AIアシスタントは、いかなるファイル編集を行う前にも、必ず本ファイル（PROJECT_RULES.md）を読み込み、以下の3点をユーザーに宣言しなければならない：
  1. 本ファイルのどの条項に沿って作業を行うか。
  2. 日本語以外の表記（英語）が混入しないことの確認。
  3. つぎはぎ（パスタ）的な場当たり的修正を行わず、本質的な解決を行うことの誓約。

## 8. マスタデータの構造定義 (MASTER DATA STRUCTURE V2)
- **原則**: 「内装」と「外装」は同一テーブル内で**「区分（Category）」フラグ**によって明確に管理する。テーブルを物理的に分割しない。
- **1. 作業工賃マスタ (PricingRule)**
  - 必須項目: `区分 (内装/外装)`, `ブランド`, `作業名`, `標準工賃`
  - 紐付けキー（任意）: `時計Ref` (外装用), `キャリバー` (内装用), `ムーブメント製造元` (内装標準用)
- **2. 部品マスタ (PartsMaster)**
  - 必須項目: 
    - `区分 (内装/外装/共通)`: 検索の第一条件
    - `ブランド`: 汎用部品の場合は「共通」などを設定
    - `部品名`: 検索のメインキー
    - **`部品Ref`**: メーカー部品番号（不明でも空欄可だがカラムは必須）
    - **`モデル名`**: Ref不明時の「目合わせ検索」用（外装部品用）
    - **`備考/仕様`**: サイズ、色、純正/ジェネリック、新品/中古等の識別キー
    - `仕入れ価格`: 管理者のみ閲覧・編集可
    - `上代 (定価)`: 顧客提示用価格
  - 紐付けキー（任意）: `時計Ref`, `キャリバー`
- **掟：インテリジェンス・キャッシュの原則**:
  - 性質の異なるデータを区別し、マスタデータ（静的）は即時表示、膨大な履歴データ（動的）は必要時にのみ高速取得すること。
  - ブラウザのメモリを圧迫しないよう、5万件を超えるようなデータは「目次検索」と「詳細取得」を分離し、通信待ちを感じさせない構成（バックグラウンド通信）を徹底する。

## 9. 帳票・ツール類の要件 (DOCUMENTS & TOOLS)
## 9. 帳票・ツール類の完全仕様 (DOCUMENTS & TOOLS SPEC)
- **共通ルール**:
  - **レイアウト**: B2B（業者）向けは必ず「リスト形式（複数行）」、B2C（個人）向けは「詳細形式（写真可）」を基本とする。
  - **ヘッダー**: 全ての帳票に「宛名（〇〇御中/様）」と「自社情報（屋号/住所/TEL/登録番号）」を記載すること。
  - **一括発行**: 修理一覧から複数選択し、ボタン一つで「1枚のPDF」にまとめる機能を実装すること。

- **各帳票の個別仕様**:
  1. **御見積書 (Estimate)**
     - 形式: B2Bリスト形式
     - 必須項目: 明細行に `[シリアルNo]`, `[お客様名(エンドユーザー)]` を必ず含める。
- **必須アクションボタン**:
  - `見積書発行`、`納品書発行`、`請求書発行`
  - **`保証書発行`**: 修理完了後の保証書（Warranty）を出力する。
    - デザイン: 高級感のあるカードサイズ（またはA5横）。
    - 必須項目: `[保証期間]`, `[シリアルNo]`, `[Ref/ブランド]`, `[保証規定]`, `[再来店用QRコード]`.
- **帳票レイアウトの厳格な規定**:
  1. **見積書 (Estimate)**:
     - **部品・工賃分離の原則**: 「ガラス交換」などの丸めた表現を禁止し、`[部品名: ガラス]` と `[技術料: ガラス交換工賃]` に行を分けて記載する。
     - **全項目単価併記**: 部品代、技術料それぞれの単価を必ず明記する（合計のみはNG）。
     - **B2Bリスト形式**: 管理No、貴社管理No、エンドユーザー名、時計情報を横並びにする。
     - **禁止事項**: ページ下部に「総合計金額」を出さないこと。
  2. **納品書 (Delivery)**:
     - **全項目単価併記**: 見積書同様、部品と技術料を分け、それぞれの金額を記載する。
     - **必須項目**: `貴社管理No`、`時計Ref`（必須）、`税抜小計`、`消費税`、`送料`（必須）、`税込総合計`。
     - **送料の自動化**: 送付先住所の「都道府県」を自動抽出し、運賃マスタ（60サイズ基本）から送料を自動入力する機能を備えること。
  3. **御請求書 (Invoice)**
     - 形式: B2Bリスト形式（月次合算対応）
     - 必須項目: `[請求日]`, `[支払期限]`, `[振込先口座情報]`, `[合計請求額]`, `[消費税]`.
  4. **修理保証書 (Warranty)**
     - 形式: 高級感のあるカード/ハガキサイズデザイン（枠飾り・透かし）。
     - 必須項目: `[保証期間]`, `[シリアルNo]`, `[Ref/ブランド]`, `[保証規定]`, `[再来店用QRコード]`.
  5. **QRコード**
     - 仕様: 時計個体または修理IDに紐づく一意のURLを埋め込む。スキャンで即座に詳細画面へ遷移させる。

## 10. 追加機能と廃止機能の定義 (ADDITIONAL & DEPRECATED FEATURES)
- **廃止機能（V2では実装しない）**:
  - **カンバンボード**: 一覧リストと詳細画面で代替するため廃止。
  - **詳細操作ログ（履歴）**: 複雑化を防ぐため廃止。「受付日」「完了日」等の日付フィールドで進捗を管理する。
  - **バーコード検索・タグ即時印刷**: ブラウザ制約のため、QRコードとPDF印刷フローに置き換える。

- **実装機能（仕様確定）**:
  - **部品発注管理画面 (Parts Order Dashboard)**:
    - 機能: 全修理案件から「要発注」「発注中」の部品のみを抽出して一覧表示・ステータス一括管理を行う専用画面。
  - **詳細検索モード (Advanced Search)**:
    - 機能: FMPのように、各フィールド（顧客、ブランド、期間、ステータス、品番等）を組み合わせてAND/OR検索ができる高度な絞り込みパネルを実装する。
  - **修理事例公開 (WEB Publish)**:
    - 機能: 「WEB公開」ボタン押下時、修理情報（写真、作業内容）から個人情報を除いた「修理事例記事（ブログ形式）」を自動生成・公開する機能とする。マイページ機能ではない。

## Customer Communication Rules

- LINE is notification/entry only.
- Shared web pages handle approval, comments, and progress confirmation.
- Estimate generation alone must NOT move status to 承認待ち.
- Only successful LINE send may move status to 承認待ち.
- Shared pages must support different B2B/B2C UI behavior.
- B2B UI prioritizes speed and PDF access.
- B2C UI prioritizes explanation and optional recommendations.
- PDF estimate download must always be available.
- Customer message text limit is 500 chars max.
- Web and PDF customer message content must remain identical.
- Customer comments must appear as unread indicators on repair list UI.
- B2C cancellation should use consultation/confirmation flow.
- LINE notifications should be minimized to reduce message usage.
- Repair must remain the central communication entity.
- n8n is external event detection only, not business logic.
