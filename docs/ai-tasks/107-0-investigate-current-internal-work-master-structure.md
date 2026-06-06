# AI Task 107-0: 現行内装作業マスタ相当構造の調査

## 目的

現行アプリに「内装作業マスタ相当」の実装・データ構造があるかを確認し、今後設計したい内装作業マスタを既存構造へ乗せるべきか、新規に作るべきかを判断する。

## 前提

- 今回は調査のみ。
- DB/schema/code/seed/migration/既存マスタ投入は行わない。
- FMP過去案件の救済ロジックと、新アプリ通常Repairの構造化入力は切り分ける。
- 今回調査する内装作業マスタは、新アプリ通常Repairの構造化入力のためのもの。

## 調査対象ファイル

- prisma/schema.prisma
- src/actions/master-actions.ts
- src/components/repairs/RepairEntryForm.tsx
- src/app/api/repairs/route.ts
- src/app/api/repairs/[id]/route.ts
- src/app/api/masters/pricing/route.ts
- src/app/api/masters/pricing/[id]/route.ts
- src/app/(app)/masters/pricing/page.tsx
- src/lib/masterData.ts
- src/lib/part-input-options.ts
- docs/ai-tasks/054-design-work-category-master.md
- docs/ai-tasks/055-0-investigate-existing-work-category-and-pricing.md
- docs/design/critical-master-design-principles.md
- CLAUDE.md
- PROJECT_RULES.md

## schema調査結果

現行schemaに、内装作業マスタ本体として使える専用モデルは見当たらない。

確認した主なモデル:

- PricingRule
- Repair
- Estimate / EstimateItem
- PartCategoryMaster
- PartNameMaster
- PartsMaster
- PublicCaseWorkItem

存在しない、またはschema上で確認できないモデル:

- WorkNameMaster
- WorkCategoryMaster
- RepairWork
- RepairItem
- RepairWorkItem

`PricingRule` は技術料候補に最も近いが、構造は以下に限られる。

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

`PricingRule` には、作業カテゴリ、内装/外装区分、部品カテゴリ、部品名、作業/処置、処置詳細、B2B/B2C表示名、公開表示フラグはない。

## 作業マスタ相当モデルの有無

厳密な意味での作業マスタ相当モデルはない。

現行で近いものは以下。

- `PricingRule.suggestedWorkName`
  - 技術料候補名として使われる
  - 価格条件と作業名が同じテーブルに混在している
- `src/lib/masterData.ts` の `WORK_DB`
  - mock/legacy用途に見える
  - 現行RepairEntryFormの主要経路ではない
- `PublicCaseWorkItem`
  - 公開事例用スナップショット
  - 新規Repair入力の作業マスタ本体ではない

## PricingRuleの現状

`PricingRule` は、現行では「作業工賃マスタ」「技術料候補」「価格ルール」の役割をまとめて担っている。

確認できたこと:

- `suggestedWorkName` を持つ
- `brandId` / `modelId` / `caliberId` を条件として持つ
- `customerType` を持つ
- `minPrice` / `maxPrice` を持つ
- `notes` を持つ
- `category` / `workType` / `workNameId` / `workCategoryId` はない
- `customerType` は管理API/画面では保存されるが、RepairEntryFormの候補取得には使われていない
- Repair作成/更新時、labor明細から `PricingRule` へ自動作成/価格更新される

`src/actions/master-actions.ts` では、`getWorkMasters()` と `upsertWorkMaster()` が `PricingRule` をWorkMaster風に扱っている。
ただし `upsertWorkMaster()` の引数には `category: internal | external` があるものの、`PricingRule` に保存先がないため永続化されない。

## RepairEntryFormでの技術料入力・候補表示の現状

`RepairEntryForm.tsx` では、見積・修理明細の行が技術料または交換部品として扱われる。

技術料側:

- `addItemCategory === "internal"` のとき技術料追加扱い
- ブランド選択がある場合に `getPricingRules()` を呼ぶ
- `pricingCaliberId` は、ムーブメントCal、ベースムーブメントCal、通常Calの順で決まる
- `PricingRule` は `workOpts` に変換される
  - label: `suggestedWorkName`
  - value: `suggestedWorkName`
  - price: `minPrice`
- `AdvancedCombobox` で候補表示される
- 選択または自由入力した作業名と価格が `LineItem` に入る

保存時:

- `EstimateItem.type` は `category.includes("part") ? "part" : "labor"` で決まる
- labor明細は `PricingRule` へ自動同期される
- 同名のPricingRuleがなければ作成
- 既存があれば `minPrice` / `maxPrice` を更新

このため、現行フォームの技術料入力は「PricingRule候補 + 自由入力 + 保存時学習」の構造。
カテゴリ選択や作業/処置のドリルダウン入力ではない。

## PartCategoryMaster / PartNameMaster / PartsMasterとの関係

部品マスタ側は、作業マスタ側よりも構造化が進んでいる。

`PartCategoryMaster`:

- `key`
- `partType`
- `nameJa`
- `nameEn`
- `sortOrder`
- `isActive`

`PartNameMaster`:

- `key`
- `categoryId`
- `partType`
- `nameJa`
- `nameEn`
- `displayJa`
- `displayEn`
- `sortOrder`
- `isActive`

`PartsMaster`:

- `standardPartNameId`
- `gradeId`
- `partType`
- `category`
- `subcategory`
- ブランド/モデル/Cal/ムーブメント関連
- 部品名、部品Ref、Cousins番号、グレード、サイズ、写真キー
- 仕入価格、上代、在庫、仕入先

また `src/lib/part-input-options.ts` に、内装/外装のカテゴリと標準部品名候補が静的定義されている。
これは今回の内装作業マスタで「カテゴリ」「部品名」の土台として流用しやすい。

ただし、PartCategoryMaster / PartNameMaster はあくまで部品マスタであり、作業/処置や技術料表示名を持つ構造ではない。

## 既存データ量

DB件数確認は、`.env.local` が localhost DB を向いていることを確認したうえで読み取り専用で試みた。

結果:

- `.env`: remote-like
- `.env.local`: local
- ローカルDB `localhost:54322` は現在起動しておらず、Prisma接続は `Can't reach database server at localhost:54322` で失敗
- そのため、DB上の実件数は今回未確認

確認したかった件数:

- PricingRule
- PartCategoryMaster
- PartNameMaster
- PartsMaster
- EstimateItem type=labor
- EstimateItem type=part

schema/code/docsから分かる範囲では、作業名専用マスタのDB件数は「モデル自体がないため0相当」と判断する。

## 今回の内装作業マスタ方針との適合性

今回ほしい構造:

- workType: internal / external
- categoryKey / categoryName
- partCategoryKey / partCategoryName
- partKey / partName
- actionKey / actionName
- actionDetail
- standardWorkName
- workNameB2B
- workNameB2C
- defaultLaborPrice
- priceRuleId
- defaultShowPriceB2B
- defaultShowPriceB2C
- sortOrder
- isActive

現行構造との適合性:

- `PricingRule`: 価格条件と作業名候補のみ。大幅に不足
- `PartCategoryMaster` / `PartNameMaster`: 部品カテゴリ・部品名の土台として適合
- `PartsMaster`: 在庫・価格・仕入・部品Refなどの部品実体として適合
- `EstimateItem`: 実績明細だが、作業マスタIDや作業カテゴリIDを持たない
- `PublicCaseWorkItem`: 公開事例スナップショットとしては近いが、入力マスタ本体ではない

## 流用できそうなもの

- `PartCategoryMaster`
  - 内装部品カテゴリの参照元として流用可能
- `PartNameMaster`
  - 内装部品名の参照元として流用可能
- `PartsMaster`
  - 部品在庫・価格・仕入・サイズ・写真・海外検索などの部品実体として維持
- `PricingRule`
  - 作業マスタ本体ではなく、価格ルール/候補価格として維持
  - 将来 `priceRuleId` または `workMasterId` との紐づけで活用可能
- `EstimateItem`
  - 将来的に `workMasterId` / `workNameId` / `pricingRuleId` を持たせる実績明細として拡張候補
- `PublicCaseWorkItem`
  - PublicCaseへのスナップショット先として活用

## 足りないもの

現行構造には以下がない。

- 作業カテゴリマスタ
- 作業名マスタ
- 内装/外装を作業側で明示する `workType` / `workDomain`
- 部品カテゴリ・部品名と作業/処置の紐づき
- `actionKey` / `actionName`
- `actionDetail`
- 標準作業名
- B2B表示名
- B2C表示名
- B2B/B2C価格表示デフォルト
- 作業マスタの表示順・有効/無効
- RepairのEstimateItemに保存する作業マスタ参照
- PricingRuleと作業マスタの明示的な関連

## 作り直し判断

判断は **C案: PricingRuleは価格ルールとして残し、作業マスタは新規に作るべき**。

理由:

- `PricingRule` は現行フォームの技術料候補・価格学習で使われており、壊すべきではない
- ただし `PricingRule` は価格条件のテーブルであり、作業名標準化・部品紐づけ・B2B/B2C表示名の本体にするには責務が混ざりすぎる
- `PartCategoryMaster` / `PartNameMaster` は部品マスタとして十分に活かせる
- 新しい内装作業マスタは、部品マスタを参照しながら作業/処置/表示名を定義する別テーブルにする方が安全

A案「既存構造をそのまま使える」は不可。
B案「既存構造に少し追加すれば使える」は、単純なカテゴリ追加だけなら可能だが、今回の方針には不足。
D案「既存構造はほぼ使わない」までは不要。部品マスタとPricingRuleは役割を分ければ使える。

## 推奨方針

推奨は以下。

1. PricingRuleは削除せず、価格ルール・過去候補・互換レイヤーとして残す
2. 新規に `InternalWorkMaster` もしくは汎用 `RepairWorkMaster` を設計する
3. 作業マスタは `PartCategoryMaster` / `PartNameMaster` を参照できるようにする
4. 作業/処置、処置詳細、標準作業名、B2B/B2C表示名、価格表示デフォルトを作業マスタ側に持たせる
5. `PricingRule` は `workMasterId` または `workNameId` を nullable で持てるようにして段階接続する
6. `EstimateItem` には将来的に `workMasterId` / `pricingRuleId` / `workSnapshot` 相当を保存する
7. PublicCase化時は、EstimateItemに保存された構造化データをスナップショットする

モデル名の方向性:

- 内装専用から始めるなら `InternalWorkMaster`
- 外装や将来の共通化も見据えるなら `RepairWorkMaster` + `workType`

今回の思想では外装もPublicCase対象であり、将来B2B/B2C表示を共通化するため、最終的には `RepairWorkMaster` + `workType` の方が拡張しやすい。
ただし、初期実装は内装のみ有効化してもよい。

## FMP過去案件と新アプリ通常Repairの切り分け

FMP過去案件:

- 過去データ救済
- 表記ゆれ整理、読み仮名削除、○○補正、カテゴリ推定はFMP専用
- FMP文字列をそのまま新アプリ用作業マスタ化しない

新アプリ通常Repair:

- 最初から構造化入力
- 部品カテゴリ、部品名、作業/処置、表示名、価格ルールを選択/補完する
- FMP専用クリーニングや推定に依存しない

PublicCase:

- Repair側で確定した構造化データをスナップショット化して表示する
- FMP由来か新アプリ由来かを閲覧者に見せない

## 変更しなかったもの

- DB更新なし
- schema変更なし
- migration作成なし
- seed作成なし
- マスタ投入なし
- PublicCase再生成なし
- import script実行なし
- アプリ画面変更なし
- 既存コード変更なし
- RepairEntryForm.tsx変更なし
- PricingRule変更なし

## 次タスク案

- Task 107: 内装作業マスタの最小DBモデル設計
- Task 108: PricingRuleと新作業マスタの接続設計
- Task 109: RepairEntryFormの内装作業ドリルダウン入力設計
- Task 110: EstimateItemへの作業マスタ参照保存設計
