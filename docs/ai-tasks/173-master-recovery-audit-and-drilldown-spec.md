# Task173: マスタ復旧監査とドリルダウン仕様の調査

## 境界と証拠の扱い

本 Task は docs-only / investigation。schema、migration、DB、seed、importer、アプリ実装、production への書き込み、deploy、tag、既存の正本文書は変更しない。`docs/ai/03_CURRENT_TASK.md` の LINE rollout 状態も変更しない。**Task173 の文書作成前に ChatGPT orchestrator が read-only 事前監査を実施した**。現 production は Supabase への read-only 直接照会、local `clock_repair_local` は Docker 経由の read-only 直接照会、2026-09-12 dump は `pg_restore` による read-only 調査で、下表の 14 表の件数を検証した。この文書改訂中に DB を再照会したわけではない。**9/5 の dump、9/12 の backup、local、現時点の production を同一状態として扱わない**。

参照した正本・実装: [実装ルール](../ai/04_IMPLEMENTATION_RULES.md)、[現行 Task](../ai/03_CURRENT_TASK.md)、[作業・価格ガイド](../MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md)、[マスタ設計原則](../design/critical-master-design-principles.md)、[2026-09-20 PartsMaster 設計](../design/parts-master-fitment-supplier-estimate-design.md)、[Task136](136-business-app-recovery.md)、[Task142](142-production-foundation-master-import-preparation.md)、`prisma/schema.prisma`、`prisma/seed.ts`、`scripts/seed-canonical-brands.ts`、`scripts/import-production-foundation-masters.ts`、`src/data/canonical-brands.ts`、`src/lib/canonical-brands.ts`、`src/lib/master-normalize.ts`、`src/lib/part-input-options.ts`、`src/actions/master-actions.ts`、`src/lib/pricing-rules.ts`、`src/components/repairs/RepairEntryForm.tsx`。外部 Notion / ChatGPT の未提示の会話・ページは独立した証拠として検証できていない。

## Confirmed facts / 復元元と件数

| master | 現 production（Supabase） | 9/12 dump（pg_restore） | local（Docker） | 復元可能な source / 注意 |
| --- | ---: | ---: | ---: | --- |
| Brand | 0 | 297 | 297 | FMP 承認 inventory と明示 override から作る canonical 297。`CANONICAL_BRANDS` / 専用 seed を使用 |
| BrandAlias | 0 | 581 | 581 | canonical seed は name / nameEn / nameJp / aliases を `normalizeBrandName` で重複排除。Task174で9/12 dump 581件とcanonical 581件のnormalizedAlias・alias表示文字列が完全一致と確認 |
| Model | 0 | 1 | 3 | dump / local の個別行を人手照合。包括的 canonical seed は確認できない |
| WatchReference | 0 | 1 | 1 | 同上。`WatchReference` は `Model` に属し、`caliberId` は任意 |
| Caliber | 0 | 2 | 1 | 同上。`brandId` は movement maker を表せるが任意 |
| RepairWorkCategory | 0 | 17 | 17 | `prisma/seed.ts` と Task142 importer の既定 17。INTERNAL 11 / EXTERNAL 6 |
| RepairWorkAction | 0 | 24 | 24 | `prisma/seed.ts` と Task142 importer の既定 24。既存定義以外を推測で追加しない |
| RepairWorkName | 0 | 0 | 0 | schema はあるが、Task142 の 308 件には含まれない。今後、実作業と人手確認から育てる |
| PartCategoryMaster | 0 | 17 | 17 | `src/lib/part-input-options.ts` の `PART_CATEGORIES` |
| PartNameMaster | 0 | 236 | 236 | 同ファイルの `PART_NAME_OPTIONS`。標準部品名であり実部品ではない |
| PartGradeMaster | 0 | 4 | 3 | Task142 の production 対象は genuine / fit / custom_fit / used の 4。local に used が欠ける |
| Supplier | 0 | 10 | 10 | `prisma/seed.ts` / Task142 importer の 10 |
| PartsMaster | 0 | 2 | 6 | 個別の実部品・在庫。基礎マスタ importer の対象外。行単位の同一性・適合・価格を監査する |
| PricingRule | 0 | 3 | 9 | 個別の価格ルール。基礎マスタ importer の対象外。価格の正当性と customerType を監査する |

Task142 は **17 + 24 + 17 + 236 + 4 + 10 = 308 件**の *6 種の基礎マスタ* だけを扱う。隔離した 9/5 production dump clone で、対象 6 表が空の状態から dry-run 308 create、初回 308 create、再実行 308 update を検証済みと記録されている。Task142 の clone 検証は、現 production の 0 件とは別の証拠であり、Brand/BrandAlias・Model/Ref/Cal・RepairWorkName・PartsMaster・PricingRule の投入計画でもない。Task136 の 9/5 production dump では PricingRule / PartsMaster などが 0 件だった。一方、9/12 dump には上表の行がある。9/12 から現 production の 0 件に至った経緯は未解明である。

9/12 backup: `C:\Users\yoshi\clock-repair-backups\20260912\production-pre-task163-165.dump`（848,605 bytes）。Task173 事前監査で `pg_restore` により内容の件数を read-only 検証した。特に local の PricingRule 9 件を production へ一括コピーしない。依頼時に挙がった 1,000 円の疑義、ROLEX Datejust の B2B 8,000 円、OH の B2B/B2C 各 15,000 円などは監査候補であり、正式価格・投入対象と認定していない。9/12 dump の PricingRule 3 件との差を、customerType、対象 Brand/Model/Cal、対象部品、処置、価格、作成元、重複で行単位比較する。`PricingRule` は価格ルールで、`RepairWorkName` や `PartsMaster` の代替ではない。

## Canonical drilldown / 入力と検索の仕様整理

各ルートで「時計情報」「作業」「実部品」「価格」を分ける。以下は現行 schema / ガイド / コードから確定できる軸と、後続 Task の目標を分けて記す。

| ルート | ドリルダウンの基準 | 現行と未実装部分 |
| --- | --- | --- |
| 内装部品 | movementMaker → movementCaliber / base maker + base Cal → `PartCategoryMaster` → `PartNameMaster` → `PartsMaster` → grade / 在庫 / 部品 Ref | `getPartsMatched` は maker + Cal の組、または base maker + base Cal の組で内装実部品を探す。Cal 文脈が決まった後の内装検索では時計 Ref を検索キーにしない。標準部品名による段階的絞り込みと多対多適合の確定は別 Task |
| 内装技術料 | movementMaker → movement Cal / base Cal → `RepairWorkCategory(INTERNAL)` → 必要なら対象 `PartNameMaster` → `RepairWorkName` / 処置 / detail → `PricingRule` | 対象部品名がない OH・検査等も許す。現行 `RepairEntryForm` はカテゴリ・対象部品・処置・detail を使い、movement Cal → base Cal → watch Cal → Cal なしで価格候補取得。`RepairWorkName` の網羅的候補整備は未確認 |
| 外装部品 | watch Brand → Product Ref / Case Ref → Model は補助・fallback → `PartCategoryMaster` → `PartNameMaster` → 適合する `PartsMaster` | `PartsMaster.watchRefs` は現行 String。`getPartsMatched` の外装候補は Brand と任意 Model で探し、Ref / Case Ref の厳密な適合判定は実装されていない。Ref から Model・Cal を推定確定しない |
| 外装技術料 | watch Brand / Ref / Case Ref / 任意 Model → `RepairWorkCategory(EXTERNAL)` → 対象 `PartNameMaster` → 許可された処置 → detailLabel → `PricingRule` | 現行外装価格は `customerType` + Brand + 対象部品名 + 処置が必須、Model は任意、Cal は null。外装 LABOR と外装 PART を分ける。Ref / Case Ref による価格照合は後続設計 |

**以下はユーザー提供の運用例であり、対応関係・適合・正式名称を seed の事実として検証したものではない。** ROLEX Ref 16233 と ROLEX Ref 16610 は、それぞれ独立した時計 Ref で、例では両方が Cal.3135 を使用する。16610 を 16233 の Case Ref として扱わない。

```text
内装部品: ROLEX movement maker → Cal.3135 → 動力・巻上 → ゼンマイ
          → 実部品候補 → 部品 Ref 771
内装作業: ROLEX movement maker → Cal.3135 → 動力・巻上 → ゼンマイ
          → 処置: 修正 + detail: スリッピングアタッチメント
          → 標準作業名の例: スリッピングアタッチメント修正
外装部品: ROLEX → Ref 16233 → リューズ・チューブ → リューズ
          → 実部品候補 → 部品 Ref 24-603-0
```

内装では Cal 文脈から部品・作業候補へ進み、元の時計 Ref 16233 / 16610 によって内装候補を分断しない。`RepairWorkName` は事前監査の 3 環境すべてで 0 件であり、実際の作業を人が確認しながら育てる想定。処置値・detail・標準作業名をこの例から推測登録しない。`WatchReference.name`、`PartsMaster.watchRefs`、`PartsMaster.partRefs`、販売店商品番号を同じ Ref として扱わない。

`PartCategoryMaster` は部品分類、`RepairWorkCategory` は作業分類で、名称が似ても相互流用しない。ユーザー確認済みの要件として、両ドリルダウンは似たカテゴリ・部品名概念を多数共有するが、**完全な同一分類への統合で問題が生じたため、同一とは仮定しない**。必要な接続は明示的な対応表として設計する。`PartNameMaster` は共通の標準部品名、`PartsMaster` は実物・在庫・価格のある部品。LABOR の `targetPartNameId` は String の `PartNameMaster.id`、PART の `partsMasterId` は `PartsMaster.id`。内装と外装の `RepairWorkCategory` / 許可処置は `docs/ai/04_IMPLEMENTATION_RULES.md` に従い混在させない。対象部品なしの作業や未分類候補は人手確認を維持する。

seed にはグローバルな `RepairWorkAction.other` が存在する。一方、`docs/ai/04_IMPLEMENTATION_RULES.md` の INTERNAL / EXTERNAL の許可処置一覧には `other` が含まれない。ユーザーが記憶する「その他」の逃げ道が、detail、標準作業名、カテゴリ、暫定・要確認フローのどこに属するかは **OPEN DECISION**。正本ルールが明示変更されるまで、`RepairWorkAction.other` を内装・外装の許可処置として表示・使用しない。

## Implemented vs design-only / 情報源と信頼度

現行実装には `Brand` / `BrandAlias` / `Model` / `WatchReference` / `Caliber` と作業・部品・価格の各 schema、正規化 helper、内装/外装の入力と候補取得、`PartsMaster` の maker + Cal または watch Brand + Model 検索がある。`normalizeBrandName` は NFKC、Latin ダイアクリティカル除去、大小・空白・一部記号の同一視をする **lookup key**。日本語の長音・濁点は保持する。`resolveBrand` はまず `normalizedAlias` を見て、次に Brand の name / nameEn / nameJp を照合する。候補衝突は seed 前に検出する。**任意の新規 Brand 登録に英語のみを要求する validation は現状ない**。公式 Latin 表記が存在する場合はそれを canonical 名とし、日本語・略称・legacy 表記を alias にする方向は提案であり、新たに強制されたルールではない。採用基準と登録時 validation は OPEN DECISION。`findOrCreateBrand` が存在することと、AI が未確認名を自動正式登録してよいことは別である。

2026-09-20 の [PartsMaster 適合・仕入先・見積入力設計](../design/parts-master-fitment-supplier-estimate-design.md) は、実物として同一と確認された部品 1 件に複数の購入先条件を結び、Cal / WatchReference との多対多適合を管理する方針を正本としている。古い [重要設計原則](../design/critical-master-design-principles.md) の「仕入先・価格が違えば常に別 PartsMaster」という例より新しい。`SupplierOffer`、適合 relation、`CANDIDATE / VERIFIED / REJECTED`、要加工情報、使用結果の履歴は **設計方針であり、この Task では schema / 実装済みとは扱わない**。1 部品が複数 Cal / Ref に適合し得る。互換 Cal / Base Cal、AI、Cousins、Web、資料からの推測は候補であり、実使用確認なしに VERIFIED としない。partRef の一致も同一実部品の自動統合根拠にはしない。

### 多言語・クロノグラフ部品名（設計のみ）

クロノグラフや特殊機構には、メーカー・Cal 固有の役割や名称を持ち、メーカー間で 1 対 1 に対応しない部品がある。架空の「メーカー共通日本語標準名」に押し込まない。メーカー公式の原語名を出典付きの source name として残す。確立した日本語名がない場合、Katari / AI による日本語の直訳は **PROVISIONAL な翻訳**と明記し、公式名・検証済み名と区別する。日本メーカーの部品でもメーカー公式の英語 service manual / parts list に英語名があれば、AI 翻訳よりその公式英語名を優先する。

多言語名は検索語生成に必要である。Cousins 等の海外サイトや Web では英語・原語、国内資料・販売店では日本語を使い、部品 Ref が分かれば検索語に含める。後で検証済みの原資料を得たら暫定名の昇格・統合を人が審査する。source の原語を黙って上書きしたり、似た訳だけで同一部品と決めたりしない。現行 `PartNameMaster` には `nameJa` / `nameEn` / `displayJa` / `displayEn` があるが、原語の出典、暫定翻訳、公式・検証済み名称の状態を明示するモデルは確認できない。したがって名称の証拠管理と承認フロー全体は **DESIGN-ONLY** であり、現行 schema に完全実装済みとは扱わない。

### Technical Document（設計のみ）

一つの Cal に複数の資料があり得る。service manual、parts list、exploded diagram（分解図）、technical guide をそれぞれ対象 Cal・発行元・版とともに扱う。将来は Repair 画面の案件 Cal から資料へ進むボタンを設けたい。候補の所在はローカル PC、Google Drive、Cousins、Web / メーカーサイトで、正本の保存場所は未決定。所在・利用権限・版・対象 Cal と原資料の部品番号を後続調査で記録し、販売店番号、標準部品名、実部品 Ref と区別して照合する。

将来の資料取り込みフローでは、資料から **部品 Ref 候補 + 公式原語名 + 部品カテゴリ + 英語/日本語表現**を抽出し、出典付き候補として人が確認してから登録する。直訳は暫定翻訳として扱う。未レビューのマスタ自動作成はしない。資料の記載だけで適合 VERIFIED、購入可能、価格確定、外装 Ref との一致を宣言しない。現行 schema に資料の版・根拠・名称承認状態を正式保存する仕組みや Repair 画面からの資料ボタンは確認できず、収集・取り込み・保存場所・UI は後続 Task の設計対象である。

## Gaps / open decisions

1. 現 production の 14 表が 0 件であることは Task173 事前監査で確認済み。未解決なのは 9/5 の Task136 dump、9/12 の非空 dump、local、現 production の間で、いつ・なぜ行が変化したかという履歴と行単位差分。`RepairWorkName` は 3 環境で 0 件であり、既存データの復元元はない。
2. canonical Brand 297 と BrandAlias 581 の生成結果を実行時 dry-run で確認する。Task174のread-only再監査で9/12 backupもBrand 297 / BrandAlias 581でcanonicalと完全一致したため、旧539件記録は訂正済み。Brand 名・役割・Latin / 日本語 / かなの正式表記と alias 承認方針は引き続き明示判断する。
3. Model / Product Ref / Case Ref / Cal の個別の親子・対応を FMP 原本や技術資料と照合する。Ref からの Model fallback、Cal 推定、多対多関係は現行 schema の制限を踏まえ別 Task で設計する。
4. `PartGradeMaster` の local 3 と Task142 target / backup 4 の差。`used` は grade のみで、標準部品名に埋め込まない。
5. PartsMaster 2 対 6、PricingRule 3 対 9 の個別レコード差。仮値・1,000 円・B2B/B2C の妥当性は所有者の価格確認を要する。特に 9 件を正式 seed とみなさない。
6. PartCategory と RepairWorkCategory の明示的な対応表、内外装で許可する Action、`RepairWorkName` と detailLabel の候補・承認状態、対象部品なし作業の経路を canonical 定義と照合する。seed の `other` をどう扱うかは正本ルールに照らす OPEN DECISION。新しい Category / Action を推測で作らない。
7. Ref・部品 Ref・販売店番号・技術資料の根拠、適合 `CANDIDATE / VERIFIED / REJECTED`、要加工・実使用履歴を保存し検索に反映する schema / UI / 移行方針は未実装の設計課題。クロノグラフ等の原語名・公式英語名・暫定日本語訳の証拠と承認状態、Cal から複数資料への導線も未実装。

## Explicit non-goals

Task173 の事前監査で行った read-only 照会以外に、今回 production の DML/DDL・backup 作成・import・seed・migration・deploy・tag・価格更新は行わない。9/12 backup を production の現在値として採用せず、local 行を無審査でコピーしない。FMP / Technical Document / AI の曖昧な情報を正式マスタや VERIFIED 適合に自動昇格しない。`docs/ai/03_CURRENT_TASK.md` や既存正本文書を編集しない。

## Next Task safety gates / 推奨順序

1. **read-only 差分監査**: Task173 事前監査で production 14 表 = 各 0 件を確認済み。後続実行の直前には接続先・時点を再確認し、自然キー、FK、重複、9/12 dump / local との行単位差分を秘密値を出さず取得する。現行 migration・deploy source も確認する。
2. **Brand**: canonical seed の production dry-run で 297 と正規化 Alias 見込み件数・衝突・既存行更新を確認する。`scripts/seed-canonical-brands.ts` は既定 dry-run だが `--apply` に Task142 の二重 production 確認はない。実行手順・承認・backup を別 Task で固める。
3. **backup 後に Brand / Alias 投入**: 現況差分を承認し、専用手順で実行・再計数する。既存 movement maker の true を false に戻さない seed 挙動も確認する。
4. **基礎 6 マスタ**: Task142 importer を現 production に dry-run し、17 / 24 / 17 / 236 / 4 / 10 の create / update と既存レコードを確認する。Task142 の clone 結果を production 実行結果として流用しない。backup・承認後に別 Task で実行し、件数・自然キー・FK を検証する。包括的 `prisma db seed` は使わない。
5. **個別データの復元判断**: Model / Ref / Cal を FMP・backup・local と行単位照合し、親 ID を production で解決する。次に RepairWorkName、PartsMaster、PricingRule を別々に監査・承認する。価格と在庫、適合 VERIFIED は人手の根拠確認を要する。
6. **ドリルダウン改善**: Ref / Case Ref と Model fallback、内外装候補絞り込み、資料根拠・多対多適合・使用履歴の設計を後続 Task に分ける。schema / migration / 認証・権限が必要なら独立レビュー、backup、手動画面確認手順、production rollout 記録を設ける。

この文書は次 Task の仕様・監査の出発点であり、production 投入指示や deploy 完了記録ではない。**Production: pending（この docs-only Task に production 変更なし）**。
