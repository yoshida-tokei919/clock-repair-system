# AI Task 055-0: 過去の作業カテゴリ定義と現行PricingRule動作の確認

## 目的

作業カテゴリ・作業名マスタを新しく定義する前に、過去docsに残っている作業カテゴリ/作業名/技術料マスタ案と、現在アプリ内で動いている `PricingRule` による作業名・価格候補ロジックを棚卸しする。

今回は調査と設計整理のみ。実装、Prisma schema変更、migration、API追加、UI変更、seed作成、リファクタリングは行わない。

## 確認したファイル

- `CLAUDE.md`
- `PROJECT_RULES.md`
- `README.md`
- `docs/design/critical-master-design-principles.md`
- `docs/design/repair-status-workflow-rules.md`
- `docs/ai-tasks/001-hide-parts-search-button-on-labor-items.md`
- `docs/ai-tasks/007-investigate-part-input-flow.md`
- `docs/ai-tasks/008-create-part-input-options-definition.md`
- `docs/ai-tasks/011-design-part-helper-selection-persistence.md`
- `docs/ai-tasks/027-5-audit-and-redesign-parts-master-masters.md`
- `docs/ai-tasks/054-design-work-category-master.md`
- `prisma/schema.prisma`
- `prisma/seed.ts`
- `src/actions/master-actions.ts`
- `src/app/api/masters/pricing/route.ts`
- `src/app/api/masters/pricing/[id]/route.ts`
- `src/app/(app)/masters/pricing/page.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/(app)/repairs/new/page.tsx`
- `src/app/(app)/repairs/[id]/page.tsx`
- `src/app/(app)/repairs/[id]/edit/page.tsx`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/lib/masterData.ts`

補足:

- 指定にあった `src/app/repairs/[id]/page.tsx` と `src/app/repairs/new/page.tsx` は存在せず、現行は `src/app/(app)/repairs/[id]/page.tsx` と `src/app/(app)/repairs/new/page.tsx`。
- `src/lib/pricing*` は該当ファイルなし。

## 見つかった過去定義

### PricingRuleを作業工賃マスタとして扱う記録

`PROJECT_RULES.md` と `CLAUDE.md` に、見積明細の技術料を `PricingRule` に自動登録/更新するルールが残っている。

要点:

- 修理の新規作成・更新時、見積セクションの「作業工賃」「部品」は、なければ `PricingRule` / `PartsMaster` に自動登録・更新する。
- 対象単位は時計のブランド/モデル/キャリバー。
- `PricingRule` は作業マスタ、または作業工賃マスタとして扱われている。
- 必須項目案として、過去には `区分(内装/外装)`, `ブランド`, `作業名`, `標準工賃` が挙げられている。

### 内装/外装の作業・部品分類

`PROJECT_RULES.md` には、内装/外装の定義がある。

- 内装修理・内装部品: 時計のムーブメント/機械体に対する作業と部品。
- 外装修理・外装部品: ムーブメント以外に対する作業と部品。
- 内装はキャリバー依存、外装はモデル/Ref依存という考え方が残っている。

ただし、これは作業カテゴリマスタの完成形ではなく、内装/外装の大分類・検索軸の定義に近い。

### RepairWork と PricingRule の役割

`docs/design/critical-master-design-principles.md` では、重要マスタとして次が挙げられている。

- `RepairWork`: 技術料・修理内容の標準化
- `PricingRule`: 技術料・条件別価格の自動挿入
- `Caliber`: 内装部品・技術料・価格の軸

このdocでは、作業内容の標準化と価格ルールは本来分けたい、という方向性が読み取れる。一方で現行実装では `RepairWork` 専用テーブルはなく、`PricingRule.suggestedWorkName` が作業名候補を兼ねている。

### PricingRule由来の価格例

`docs/design/critical-master-design-principles.md` に、PricingRule由来の価格例として次のような記録がある。

- `ROLEX / Cal.3135 / オーバーホール`
- `ROLEX / Cal.3135 / ゼンマイ交換 技術料`
- `ROLEX / 16233 / 竜頭交換 技術料`

また、`PricingRule` がないと技術料・条件別標準価格の自動挿入ができない、という整理もある。

### legacy/mock の作業候補

`src/lib/masterData.ts` に、モック/レガシーの `WORK_DB` が残っている。

主な内容:

- `Caliber c2 = 3135`
- `w1: オーバーホール / 45,000円 / internal / targetId c2`
- `w2: オーバーホール / 65,000円 / internal / targetId c1`
- `w3: 時間調整 / 3,000円 / internal / targetId c2`
- `w4: ガラス交換 / 15,000円 / external / targetId r1`
- `w5: 新品仕上げ / 20,000円 / external / targetId r1`

`MasterService.getInternalWorkOptions(calName)` は `WORK_DB` を `category === "internal"` かつ `targetId === caliber.id` で絞り込む。`getPriceForCaliber()` は該当Calの内部作業候補から `オーバーホール` を探して価格を返す。

ただし、現行の `RepairEntryForm` はこの `MasterService` ではなく、Prismaの `getPricingRules()` を使っている。したがって `Cal.3135 -> オーバーホール 45,000円` は legacy/mock には存在するが、現行フォームの主要動線ではない。

### Cal.3135 -> オーバーホール 15,000円 の記録

検索した範囲では、`Cal.3135 -> オーバーホール 15,000円` という明示的な定義は見つからなかった。

近いもの:

- `src/lib/masterData.ts`: `Cal.3135 -> オーバーホール 45,000円`
- `src/lib/masterData.ts`: `Ref r1 -> ガラス交換 15,000円`
- `src/app/pdf-preview/page.tsx`: `オーバーホール工賃 35,000円` のPDFプレビュー用サンプル
- `src/components/repairs/RepairEntryForm.tsx`: AI入力placeholderに `オーバーホール15,000円` の例文

よって、15,000円のオーバーホールはサンプル文言としては存在するが、現行の価格候補マスタとして定義されているとは確認できない。

## 見つからなかったもの

- 現行Prisma schema上の `WorkCategoryMaster`
- 現行Prisma schema上の `WorkNameMaster`
- 現行Prisma schema上の `RepairWork`
- `PricingRule.workCategoryId`
- `PricingRule.workNameId`
- `EstimateItem.workCategoryId`
- `EstimateItem.workNameId`
- 作業カテゴリ専用のseed
- `src/lib/pricing*`
- 公開事例タグ専用の正式マスタ

`docs/ai-tasks/054-design-work-category-master.md` には `WorkCategoryMaster` 案があるが、これは設計mdであり、実装済みの構造ではない。

## 現行PricingRule構造

`prisma/schema.prisma` の `PricingRule`:

```prisma
model PricingRule {
  id                Int     @id @default(autoincrement())
  brandId           Int?
  modelId           Int?
  caliberId         Int?
  customerType      String?
  minPrice          Int
  maxPrice          Int
  suggestedWorkName String
  notes             String?
}
```

主な意味:

- `brandId`: ブランド条件
- `modelId`: モデル条件
- `caliberId`: キャリバー条件
- `customerType`: B2B/B2Cなどの顧客種別を入れる想定
- `minPrice`: 候補として使われる価格
- `maxPrice`: 価格幅の上限
- `suggestedWorkName`: 技術料/作業名候補
- `notes`: 備考・仕様違いの区別に使われている

現状、`category`, `workCategory`, `workName`, `internal/external` 専用カラムはない。

## Pricing管理API/画面

`src/app/api/masters/pricing/route.ts`:

- GETは `PricingRule` を取得し、`brandName`, `modelName`, `caliberName`, `workName`, `minPrice`, `maxPrice`, `customerType`, `notes` にマッピングする。
- POSTは `brandName`, `modelName`, `caliberName` からIDを解決/作成し、`PricingRule` を作成する。
- `customerType` が未指定なら `individual`。

`src/app/api/masters/pricing/[id]/route.ts`:

- PUTは同じ構造で `PricingRule` を更新する。
- DELETEは `PricingRule` を削除する。

`src/app/(app)/masters/pricing/page.tsx`:

- PricingRuleの一覧・編集画面。
- 入力項目はブランド、モデル、対象キャリバー/型番、作業内容名、最低価格、最高価格、備考、顧客種別。
- 画面上の対象欄placeholderは `3135 / 16233...` で、Cal/Refのような条件入力を想定している。
- 作業内容placeholderは `オーバーホール等`。
- 作業カテゴリや作業名マスタの選択欄はない。

## getPricingRules() のロジック

`src/actions/master-actions.ts` の `getPricingRules(brandId, modelId, caliberId)` が現行フォームの技術料候補取得に使われる。

流れ:

1. `brandId` がない場合は空配列。
2. `where.brandId = brandId` を必須条件にする。
3. `modelId` がある場合、`modelId = 指定値` または `modelId = null` を対象にする。
4. `caliberId` がある場合、`caliberId = 指定値` または `caliberId = null` を対象にする。
5. 取得後、キャリバー完全一致に +100、モデル完全一致に +50 のようなスコアで並べ替える。

重要:

- `customerType` は検索条件に使われていない。
- `minPrice` が候補価格として使われる。
- `maxPrice` は候補表示/自動入力には使われていない。
- `brandId` は必須なので、ブランドなしの共通技術料候補は現行RepairEntryFormからは取得されにくい。

## RepairEntryFormでの技術料候補表示の流れ

`RepairEntryForm.tsx` の明細stateは `LineItem`。

技術料/部品の判定:

- `addItemCategory = "internal"` のとき技術料追加。
- `addItemCategory = "part_external"` のとき交換部品追加。
- 保存payloadでは `category.includes("part") ? "part" : "labor"` で `type` を作る。

技術料候補取得:

1. ブランド、モデル、キャリバー、ムーブメントメーカー/キャリバー、ベースムーブメント情報などをstateに持つ。
2. `addItemCategory === "internal"` の場合だけ `getPricingRules()` を呼ぶ。
3. `pricingCaliberId` は次の優先順で決まる。
   - `movementCaliber`
   - `baseMovementCaliber`
   - 通常の `watch.caliber`
4. `getPricingRules(b.id, m?.id, pricingCaliberId)` を呼ぶ。
5. 返却された `PricingRule` を `workOpts` に変換する。
   - `label: r.suggestedWorkName`
   - `value: r.suggestedWorkName`
   - `price: r.minPrice`
6. `AdvancedCombobox` で候補表示される。
7. 候補選択または同名入力時、`newItemPrice` に `price` が入る。
8. 追加ボタンで `LineItem` に入る。

つまり、`ROLEX + Cal.3135 + PricingRule.suggestedWorkName = オーバーホール + minPrice = 15000` のレコードがDBにあれば、現行UIでも `Cal.3135 -> オーバーホール 15,000円` に近い候補表示/価格自動入力は実現される。

ただし、現行コード上は「3135だから固定でオーバーホール15,000円」とハードコードされているわけではない。DBの `PricingRule` レコード次第。

## labor明細保存時のPricingRule学習

`src/app/api/repairs/route.ts` と `src/app/api/repairs/[id]/route.ts` の両方で、保存時にlabor明細を `PricingRule` へ同期している。

新規作成時:

- `estimateItems.filter(i => i.type === "labor")` を抽出。
- `suggestedWorkName`, `brandId`, `modelId`, `caliberId` で既存を探す。
- なければ `PricingRule.createMany()`。
- あれば `minPrice` / `maxPrice` を明細価格で更新。

更新時:

- `body.estimate.items.filter(i => i.type === "labor")` を抽出。
- `suggestedWorkName`, `brandId`, `modelId`, `caliberId` で既存を探す。
- なければ作成、あれば価格更新。

注意:

- 保存時の学習は `customerType` を入れていない。
- 保存時の学習は作業カテゴリを持たない。
- `PATCH` 側は `where: { suggestedWorkName, brandId, modelId, caliberId }` の完全一致で、null/undefinedの扱いに注意が必要。
- 新規作成側では `pricingRuleWhere` / `pricingRuleData` で `undefined` を避ける配慮が入っている。

## Cal別価格候補の仕組み

現行のCal別価格候補は、次の2系統がある。

### 現行実装: PricingRule.caliberId

RepairEntryFormは `getPricingRules()` に `pricingCaliberId` を渡す。

優先順:

1. ムーブメントキャリバー
2. ベースムーブメントキャリバー
3. 時計本体のキャリバー

`getPricingRules()` は `caliberId = 指定値` または `caliberId = null` を取得し、完全一致の候補を上位に並べる。

これにより、例えばDBに以下のレコードがあれば候補化される。

```text
brandId = ROLEX
caliberId = 3135
suggestedWorkName = オーバーホール
minPrice = 15000
```

ただし、ローカルから実DBの `PricingRule` 行を読み取ろうとしたところ、現在のPrisma datasourceはPostgreSQLの `DATABASE_URL` を向いており、TLS資格情報エラーで接続できなかった。そのため、実データとして該当レコードが存在するかは今回確認できていない。

### legacy/mock: src/lib/masterData.ts

`src/lib/masterData.ts` の `WORK_DB` には、Cal.3135相当の `c2` に対して `オーバーホール 45,000円` がある。

ただしこれは現行RepairEntryFormの主要な候補取得経路ではない。古いモック/レガシー資産として扱うのが妥当。

## B2B/B2C価格差の現状

DB/API/管理画面には `PricingRule.customerType` がある。

現状:

- Pricing管理APIのPOST/PUTは `customerType` を保存する。
- 未指定なら `individual`。
- Pricing管理画面は `customerType` stateを持つ。
- `RepairEntryForm` は顧客種別として `isB2B` を持ち、保存payloadに `customer.type = business / individual` を入れる。

不足:

- `getPricingRules()` の検索条件に `customerType` が入っていない。
- RepairEntryFormから `getPricingRules()` へ `business / individual` を渡していない。
- 保存時に自動作成/更新される `PricingRule` へ `customerType` が入っていない。
- `minPrice/maxPrice` のどちらをB2B/B2C差として使うのかは未定義。

結論:

- B2B/B2C価格差を表現する器として `PricingRule.customerType` は既にある。
- ただし現行の候補取得・自動学習には効いていないため、仕様としては未完成。

## internal / external の現状

現行コードでは、`internal` / `external` が複数の意味で使われている。

- `RepairEntryForm.LineItem.category`
  - `internal`: 技術料
  - `part_external`: 交換部品
  - 型上は `external`, `part_internal`, `part_generic` もある
- `PartsMaster.category`
  - schemaコメント上は `internal`, `external`, `generic` の既存互換値
- `PartInputType`
  - `part_internal`
  - `part_external`
- 過去docs
  - 内装修理/外装修理、内装部品/外装部品の業務上の大分類

注意:

- 作業カテゴリマスタで `internal` / `external` をそのまま使うと、技術料/部品判定、部品カテゴリ、内外装分類が混線する。
- 新設するなら `workSide` や `workDomain` のような別フィールド、または `WorkCategoryMaster` の親カテゴリとして明示的に分ける方が安全。

## 作業カテゴリ/作業名マスタへの接続案

### 1. suggestedWorkNameを残した段階移行は可能

`PricingRule.suggestedWorkName` は現行フォームの候補表示と保存時学習の中核なので、いきなり消さない。

段階移行案:

1. `WorkCategoryMaster` を作る。
2. `WorkNameMaster` を作る。
3. `PricingRule` に nullable な `workNameId` を追加する。
4. 当面は `PricingRule.suggestedWorkName` を残し、`workNameId` があれば `WorkNameMaster.name` を優先、なければ `suggestedWorkName` をfallbackにする。
5. 既存PricingRuleを作業名ごとに整理し、後から `workNameId` を埋める。

### 2. WorkNameMasterを先に作る価値が高い

今回の確定方針は「作業カテゴリ・作業名はマスタ化」「入力はドリルダウン式」「作業名は検索付き候補選択」。この方針なら、`WorkCategoryMaster` だけでなく `WorkNameMaster` も早めに必要になる。

推奨構造:

- `WorkCategoryMaster`
  - 内装修理/外装修理などの大分類またはカテゴリ
- `WorkNameMaster`
  - 作業名
  - `workCategoryId`
  - 表示順
  - 有効/無効
- `PricingRule`
  - 価格条件
  - `workNameId`
  - `customerType`
  - `brandId/modelId/caliberId`
  - `minPrice/maxPrice`
  - 既存互換の `suggestedWorkName`

### 3. PricingRuleにworkCategoryIdだけを足す案は短期向け

`PricingRule.workCategoryId` は既存候補へカテゴリを付ける最小差分としては有効。

ただし、確定方針が「作業名マスタ化」まで進んでいるなら、`PricingRule.workCategoryId` だけでは作業名の表記ゆれを止められない。`workNameId` を中心にし、カテゴリは `WorkNameMaster` から辿る方が長期的にはきれい。

現実的な折衷:

- Phase A: `WorkCategoryMaster` + `WorkNameMaster`
- Phase B: `PricingRule.workNameId` 追加、`suggestedWorkName` fallback維持
- Phase C: RepairEntryFormの候補を `WorkCategory -> WorkName -> PricingRule価格` に寄せる
- Phase D: `EstimateItem.workNameId/workCategoryId` を保存

### 4. Cal別価格候補は壊さずに残せる

現行のCal別価格候補は `PricingRule.caliberId` で実現されているため、作業カテゴリ/作業名マスタ化後も `PricingRule` を価格ルールとして残せば壊さずに移行できる。

接続イメージ:

```text
WorkCategoryMaster
  -> WorkNameMaster
      -> PricingRule
          brandId/modelId/caliberId/customerType/minPrice/maxPrice
```

候補表示:

```text
内装修理
  -> オーバーホール
      -> ROLEX + Cal.3135 + business/individual に合う PricingRule
```

### 5. EstimateItem側に最終保存すべき情報

公開事例・SNS投稿へ流用するなら、価格候補だけでなく実績明細側にも作業情報を残す必要がある。

最終的に `EstimateItem` に保存したい候補:

- `workCategoryId`
- `workNameId`
- `pricingRuleId` または `sourcePricingRuleId`

最低限:

- `workNameId`

理由:

- `workNameId` からカテゴリを辿れる。
- 作業名の表記ゆれを防げる。
- 公開事例タグ変換の根にできる。

ただし、過去時点のカテゴリ名/作業名を固定したい場合は、スナップショットとして `itemName` は現状どおり残す。

## 次にやるべきこと

1. `WorkCategoryMaster` と `WorkNameMaster` の最小schemaを設計する。
2. 初期カテゴリを「内装修理 / 外装修理」の2択から始めるか、さらに下位カテゴリを同時に持つか決める。
3. 初期作業名リストを作る。
4. 既存 `PricingRule.suggestedWorkName` を `WorkNameMaster` へ移行する方針を決める。
5. `PricingRule.customerType` を候補取得に効かせる仕様を決める。
6. RepairEntryFormの候補取得を `WorkCategory -> WorkName -> PricingRule` へ段階移行する設計を書く。
7. `EstimateItem` に保存する作業情報を決める。
8. 公開事例タグとのmappingは、業務作業名を根にして別途設計する。

## 注意点

- `PricingRule` は既存資産なので捨てない。価格ルールとして残す。
- `suggestedWorkName` は移行期間中のfallbackとして残す。
- `internal` / `external` を作業カテゴリのDB値として安易に流用しない。
- `customerType` はあるが現行候補取得には効いていない。
- `minPrice` は現行候補入力に使われるが、`maxPrice` はほぼ管理/表示用。
- `Cal.3135 -> オーバーホール 15,000円` はコード構造上は実現可能だが、今回のローカル確認では実DBにそのレコードがあるか確認できていない。
- `src/lib/masterData.ts` の `WORK_DB` は現行メイン経路ではないため、新設計の根拠にしすぎない。

## 今回やらなかったこと

- Prisma schema変更
- migration作成
- API追加/変更
- UI変更
- seed作成
- 既存コードのリファクタリング
- git add / commit / push
- `.next-dev.err.log` の変更
