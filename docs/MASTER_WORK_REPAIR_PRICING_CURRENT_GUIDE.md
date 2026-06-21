# 作業マスタ・PricingRule・RepairLineItem 現行ガイド

作成日: 2026-06-19

対象ブランチ: `wip-publiccase-workmaster-20260606`

直近の前提 commit: `1fabf25 docs: design pricing rule structured work filter`

## 1. このドキュメントの位置づけ

このドキュメントは、時計修理業務アプリにおける作業マスタ、PricingRule、RepairLineItem、PartsMaster、PublicCase、帳票の関係を整理した現時点の正本ドキュメントである。

今後の Codex 作業では、作業マスタ、価格ルール、修理明細、PublicCase、帳票、共有ページ、PartsMaster に触れる前に、このファイルを参照する。

古い docs や過去チャット資料と矛盾した場合は、原則としてこのドキュメントを優先する。ただし、このドキュメント自体も固定ではない。新しい Task で方針が変わった場合は、このファイルを更新し、完了報告に「canonical docs 更新要否」を含める。

今回の Task は docs 作成のみである。schema、API、UI、seed、migration、DB、RepairEntryForm、RepairLineItem 実装、PricingRule 実装は変更しない。

## 2. 最新の開発前提

このアプリは開発中であり、現在の DB データはすべて仮データである。本番データはまだない。

仮データは消えても問題ない。現在方針に合わない古い設計、古い仮データ、中途半端な暫定処理は、必要なら作り直してよい。

ただし、関連機能へ影響する可能性がある場合は、実装前に必ず影響範囲を確認する。特に以下に影響する変更は注意する。

- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase
- PartsMaster
- `getPartsMatched`
- PartsSearchPanel
- Repair 保存 API
- PricingRule 自動作成、更新
- seed、migration、DB 初期化

## 3. 最重要の設計前提

部品マスタと作業マスタは別物である。

PartsMaster は実部品、在庫、価格、サイズ、写真、仕入れ先、海外検索、ブランド、Ref、Cal、実部品管理のためのマスタである。

作業マスタは、案件入力、作業内容、作業カテゴリ、対象部品名、処置、技術料、B2B/B2C 表示名、PublicCase 生成用の構造化データを扱う。

`RepairWorkName` が参照してよいのは、標準部品名マスタである `PartNameMaster` までである。実部品・在庫マスタである `PartsMaster` へ紐づけてはいけない。

- `targetPartNameId`: 作業対象部品名 ID。LABOR 行の対象部品で、`PartNameMaster` 由来。
- `partsMasterId`: 実部品 ID。PART 行の実部品で、`PartsMaster` 由来。

この 2 つを混同しない。

## 4. 作業マスタは表示の正本ではない

作業マスタは、入力補助、標準化、候補選択の元データである。帳票、共有ページ、PublicCase に直接表示する正本ではない。

正しい流れは以下である。

```txt
RepairWorkName
-> PricingRule
-> RepairLineItem snapshot
-> EstimateItem / 帳票 / 共有ページ
-> PublicCase snapshot
```

`RepairWorkName` や `PricingRule` を後から変更しても、過去の帳票、共有ページ、PublicCase 表示が勝手に変わらないようにする。最終表示値は `RepairLineItem` などの案件明細側に snapshot 保存する。

## 5. FMP 過去案件と新アプリ通常 Repair は分ける

FMP 過去案件には、過去データの救済、表記ゆれ整理、読み仮名除外、記号補正、カテゴリ推定、PublicCase 候補生成、FMP 専用クリーニングが必要である。

一方、新アプリ通常 Repair では、最初から構造化入力する。FMP 専用の推定、補正、表記ゆれ救済ルールを通常 Repair の標準入力ルールへ混ぜない。

FMP 由来表記は、正式な作業名ではなく、必要に応じて `aliases` や `searchKeywords` に吸収する。

## 6. 自由入力へ戻さない

FMP 時代のような完全自由入力には戻さない。

ただし、入力を重くしすぎないため、以下を両立する。

- カテゴリから辿れる
- 対象部品まで絞れる
- ただし対象部品は必須ではない
- どの段階でも文字入力検索できる
- 候補がない場合のみ、新規候補を review 状態で受ける

UI 思想は「浅く使える、深くも絞れる、どこでも検索できる、自由入力は最後の逃げ道」である。

## 7. 現在の実装済みモデルと役割

現行 schema には以下が存在する。

### RepairWorkCategory

作業カテゴリである。`repairType` により内装・外装を分ける。

`内装修理`、`外装修理` というカテゴリレコードは作らない。これらは `repairType = INTERNAL` / `EXTERNAL` で表す。

内装カテゴリ例:

- ムーブメント
- クォーツ
- 動力・巻上
- 輪列
- 脱進機
- 調速機
- 重回し
- カレンダー
- 自動巻
- クロノグラフ
- 地板

### RepairWorkAction

処置マスタである。細かい技術表現を増やしすぎず、初期は以下の 12 種を基本とする。

- 交換
- 修理
- 調整
- 修正
- 研磨
- 洗浄
- 注油
- 製作
- 取付
- 除去
- 穴詰め
- かしめ

すでに追加済みの `overhaul`、`inspection`、`other` は現行実装として記録する。ただし、今後細かい技術表現を `RepairWorkAction` へ増やしすぎない。

細かい表現は `RepairWorkName.standardName`、`detailLabel`、`aliases`、`searchKeywords` で扱う。

### RepairWorkName

標準化された作業名である。入力候補の中心であり、案件明細の snapshot 元になる。

主な項目:

- `repairType`
- `categoryId`
- `targetPartNameId`
- `actionId`
- `detailLabel`
- `standardName`
- `b2bDisplayName`
- `b2cDisplayName`
- `source`
- `reviewStatus`

`targetPartNameId` は任意であり、`PartNameMaster` を参照する。`PartsMaster` は参照しない。

### RepairLineItem

通常 Repair の明細本体である。帳票、共有ページ、PublicCase の前段にある、案件ごとの確定値を持つ。

主な構造化 field:

- `lineType`
- `partsMasterId`
- `pricingRuleId`
- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `relatedWorkLineItemId`
- `itemNameSnapshot`
- `estimateDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `detailLabelSnapshot`
- `categoryNameSnapshot`
- `targetPartNameSnapshot`
- `actionNameSnapshot`
- `unitPrice`
- `quantity`
- `showPriceB2b`
- `showPriceB2c`

帳票、共有ページ、PublicCase はマスタ直参照ではなく、この snapshot を正とする。

### PricingRule

価格ルールである。作業マスタ本体ではない。

現行 schema には以下の構造 field がある。

- `repairWorkCategoryId`
- `repairWorkActionId`
- `targetPartNameId`
- `detailLabel`
- `suggestedWorkName`

ただし 108-10Y 時点では、`getPricingRules` と Repair API の自動作成・更新処理で、これらの構造 field はまだ十分に活用されていない。現在は `suggestedWorkName` が作業名候補、価格ルール、技術料候補を兼ねている部分が残っている。

今後は `repairWorkNameId`、または `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` の併用で、作業構造と価格ルールを接続する方針を検討する。

`suggestedWorkName` は将来的に主キー的な判定軸ではなく、表示名、移行互換、fallback 用途へ寄せる。

### PartCategoryMaster / PartNameMaster / PartsMaster

`PartCategoryMaster` と `PartNameMaster` は、部品カテゴリと標準部品名である。作業マスタは必要に応じて `PartNameMaster` まで参照してよい。

`PartsMaster` は実部品、在庫、価格、仕入れ先、写真、Ref、Cal、ブランド、モデル、サイズ、グレードを扱う。作業マスタや `RepairWorkName` から直接参照しない。

### PublicCase

PublicCase は公開事例用の別 snapshot である。通常 Repair 側で `RepairLineItem` に保存された snapshot から、公開用の `PublicCaseWorkItem` / `PublicCasePartItem` を生成する。

`PublicCase` は `RepairWorkName` を直接表示しない。

## 8. 作業入力の基本思想

入力の基本ルートは以下である。

```txt
repairType
-> RepairWorkCategory
-> 必要なら PartNameMaster による対象部品絞り込み
-> RepairWorkName
```

ただし、すべてを必須にしない。

例:

```txt
internal
-> 動力・巻上
-> 一番受け
-> 一番受けピン入れ替え
```

または:

```txt
internal
-> ムーブメント
-> オーバーホール
```

カテゴリだけで候補が十分少なければ、そのまま選べる。候補が多ければ対象部品名で絞る。対象部品を選ぶのが面倒なら文字検索できる。慣れた作業者はいきなり検索できる。

## 9. 部品名まで絞れるが、部品名選択を必須にしない

カテゴリだけでは候補が多すぎる場合がある。

例:

```txt
動力・巻上
```

このカテゴリには以下のような作業が入り得る。

- ゼンマイ交換技術料
- 香箱修理
- 香箱真修理
- 一番受け穴詰め
- 一番受けピン入れ替え
- コハゼ修理
- 角穴車修理
- 丸穴車修理

そのため、必要に応じて `PartNameMaster` の対象部品名まで絞れるようにする。ただし、オーバーホール、精度調整、磁気抜き、動作確認、注油、洗浄のように特定部品へ結びつかない作業もあるため、対象部品名は必須にしない。

## 10. 修理作業カテゴリと対象部品方針

内装作業では、以下のカテゴリを初期運用する。

- ムーブメント
- クォーツ
- 動力・巻上
- 輪列
- 脱進機
- 調速機
- 重回し
- カレンダー
- 自動巻
- クロノグラフ
- 地板

カテゴリ名が部品カテゴリ名と同じになることはあるが、意味は異なる。

```txt
RepairWorkCategory
-> 作業入力、技術料候補、処置分類のためのカテゴリ

PartCategoryMaster
-> 部品交換、購入、在庫、価格、写真、仕入れ先のためのカテゴリ
```

ムーブメントカテゴリは採用してよい。ムーブメント全体に対する作業、たとえばオーバーホール、精度調整、磁気抜きは自然にここへ入る。

クォーツカテゴリでは、電池、二次電池・キャパシタ、電池押さえ、回路、コイル、接点バネなどを扱う。電池交換、二次電池交換、キャパシタ交換はクォーツカテゴリへ寄せる。

輪列カテゴリの標準部品名として「五番車」は初期採用しない。五番車はクォーツカテゴリで扱う。機械式輪列では二番車、三番車、四番車、ガンギ車などを基本とする。

カンヌキ押さえ、カンヌキ押さえネジのような表記は、正式部品名として増やさず、裏押さえ、裏押さえネジの alias / 表記ゆれとして扱う。

旧 Excel 由来の「機構一式」系の値は、正式な部品名として初期採用しない。必要になった時点で個別に検討する。

## 11. RepairWorkAction / detailLabel / aliases / searchKeywords 方針

`RepairWorkAction` は検索・分類・集計用の処置大分類である。自然な作業名そのものではない。

例:

```txt
standardName = 一番受けピン入れ替え
action = 交換
detailLabel = ピン
```

```txt
standardName = 一番受け穴詰め
action = 穴詰め
detailLabel = null
```

```txt
standardName = ローター真かしめ
action = かしめ
detailLabel = ローター真
```

`detailLabel` は初期 schema では `RepairWorkName` 上の nullable String として扱う。完全自由入力にはしない。既存候補から選べる UI を想定し、新規入力は review 扱いにする。

将来的に `detailLabel` 候補が増えた段階で、`RepairWorkDetailMaster` へ昇格できる設計にする。

FMP 由来の表記ゆれは、正式名称ではなく `aliases` / `searchKeywords` に吸収する。

例:

```txt
standardName = 一番受けピン入れ替え
aliases:
- 1番受けピン入替
- 1受けピン交換
- 1受けピン入れ替え
- 1受け軸交換
- 一受けピン
```

## 12. PricingRule の現在地と今後の方針

PricingRule は捨てない。価格ルールとして残す。

役割分担は以下である。

```txt
RepairWorkName
-> 作業名、カテゴリ、対象部品、処置、B2B/B2C 表示名 default、検索・入力補助

PricingRule
-> 条件別価格、技術料候補価格、brand / model / Cal / customerType / 作業構造に応じた価格

RepairLineItem
-> 案件ごとの実際の明細、価格、表示名 snapshot、pricingRuleId、repairWorkNameId 相当、targetPartNameId、partsMasterId
```

108-10V から 108-10X では、PricingRule の Cal 優先順位が整理された。現行の価格候補取得は以下の順序で Cal を見る。

1. `movementCaliberId`
2. `baseMovementCaliberId`
3. `watch.caliberId`
4. Cal なし

108-10X では、`getPricingRules` 本体は変えず、RepairEntryForm 側で複数回呼び出して統合する短期実装にした。

108-10Y では、PricingRule に構造 field があることを確認したが、自動作成・更新処理ではまだ十分に活用されていないことを確認した。

今後の方針:

- `PricingRule` を作業マスタ本体にしない
- `RepairWorkName` と価格ルールを接続する
- `repairWorkNameId` 追加案を検討する
- 既存の `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` を活用する
- `suggestedWorkName` だけで構造を潰さない
- Cal / Base Cal / Watch Cal / Cal なしの優先順位は維持する
- 仮 PricingRule は、方針確定後に削除・再生成してよい

## 13. RepairLineItem / EstimateItem / 帳票 / 共有ページ / PublicCase の関係

現時点の本線は以下である。

```txt
RepairWorkName
-> PricingRule
-> RepairLineItem snapshot
-> EstimateItem / 帳票 / 共有ページ
-> PublicCase snapshot
```

`EstimateItem` は見積発行時の snapshot として扱う。通常 Repair の明細本体は `RepairLineItem` である。

帳票、PDF、LINE、共有ページは、マスタを後読みして表示しない。案件明細に保存された snapshot を表示する。

PublicCase はさらに公開用 snapshot を持つ。通常 Repair から作られた `RepairLineItem` の snapshot から `PublicCaseWorkItem` / `PublicCasePartItem` を作る。

B2C では価格を表示しない。B2B では `showPriceB2b = true` かつ正の価格がある場合のみ表示する。未紐づけ PartItem 価格、0 円、内部管理文言、コピー表記は表示しない。

## 14. FMP 過去案件との切り分け

FMP 過去案件:

- 過去データ救済
- 表記ゆれ整理
- 読み仮名除外
- 記号補正
- カテゴリ推定
- PublicCase 候補生成
- FMP 専用クリーニング

新アプリ通常 Repair:

- 最初から構造化入力
- FMP 専用推定に依存しない
- カテゴリ、対象部品、処置、detail、価格を入力
- RepairLineItem へ snapshot 保存
- PublicCase 下書き生成へつなぐ

FMP 救済ルールを通常 Repair の標準入力ルールへ混ぜない。

## 15. これまでの Task 進捗

主な流れ:

- 084 から 106: PublicCase、B2C/B2B ページ、検索、ブランドかな、表示ルール
- 107 系: 作業マスタ、明細、帳票、共有ページ、RepairLineItem への整理
- 108 系: 内装作業マスタ、PricingRule、Cal / Base Cal 優先順位
- 109 系: 内装 PartNameMaster の不足差分整理

直近の重要点:

- 107-0: 現行アプリに独立した内装作業マスタ本体はなかった
- 107-1: 帳票、共有ページ、PublicCase はマスタ直表示ではなく snapshot が必要
- 107-2 以降: `RepairLineItem` 新設・整理の方向へ進んだ
- 108-10V: PricingRule の Cal / Base Cal 優先順位を設計
- 108-10W: PricingRule 短期実装の影響範囲を設計
- 108-10X: RepairEntryForm で Cal 優先順位に従って価格候補を取得
- 108-10Y: PricingRule の構造 field は存在するが、自動作成・更新では未活用と確認

## 16. これからの推奨 Task 順序

今後はこのドキュメントを正本として、以下の順で進める。

1. 108-10Z 以降を現在方針に合わせて再設計する
2. PricingRule 構造化を設計する
3. RepairWorkName と PricingRule の接続方針を決める
4. 自動作成・更新処理を構造 field 対応へ寄せる
5. seed / 仮データを整理する
6. PublicCase 下書き生成を RepairLineItem snapshot から作る
7. ドリルダウン検索 UI を設計する

## 17. やってはいけないこと

- PricingRule を作業マスタ本体にしない
- PartsMaster と作業マスタを混同しない
- `targetPartNameId` と `partsMasterId` を混同しない
- 帳票、共有ページ、PublicCase でマスタを直参照して表示しない
- FMP 救済ルールを通常 Repair へ混ぜない
- RepairWorkAction を細かく増やしすぎない
- 影響範囲調査なしに帳票、PDF、LINE、共有ページ、PublicCase を触らない
- 部品名リストから作業名を総当たり自動生成しない
- 完全自由入力を標準入力に戻さない
- 旧 Excel 由来の候補をそのまま正式マスタにしない

## 18. Codex 運用ルール

今後 Codex は、作業マスタ、PricingRule、RepairLineItem、PartsMaster、PublicCase、帳票、共有ページに関係する Task の開始時にこのファイルを読む。

Task 完了時には、以下を報告する。

- この canonical docs の更新が必要だったか
- 更新した場合は、どの方針を反映したか
- 古い docs と矛盾がある場合は、このファイルを優先したか

このファイルが古くなった場合は、関連 Task の完了時に必ず更新する。

## 19. 参照した主な資料

今回の canonical docs は、ユーザー添付の以下 3 資料を統合した。

- 内装作業マスタ設計判断メモ
- 作業マスタ・PublicCase・明細構造ロードマップ
- 内装作業入力の中核思想

加えて、repo 内の以下を参照した。

- `docs/ai-tasks/107-0-investigate-current-internal-work-master-structure.md`
- `docs/ai-tasks/107-1-investigate-repair-items-documents-shared-page-for-work-master.md`
- `docs/ai-tasks/107-2-compare-estimate-item-extension-vs-repair-line-item.md`
- `docs/ai-tasks/108-10V-design-pricing-rule-cal-base-cal-priority.md`
- `docs/ai-tasks/108-10W-design-pricing-rule-short-term-implementation-scope.md`
- `docs/ai-tasks/108-10X-implement-pricing-rule-cal-base-cal-priority.md`
- `docs/ai-tasks/108-10Y-design-pricing-rule-structured-work-filter.md`
- `docs/ai-tasks/109-0-investigate-existing-part-master-reuse.md`
- `docs/ai-tasks/109-1-compare-confirmed-internal-part-names.md`
- `docs/ai-tasks/109-2-design-internal-part-name-seed-diff.md`
- `docs/ai-tasks/109-3-seed-internal-part-name-diff.md`
- `prisma/schema.prisma`

## 20. 108-10AA / 108-10AB で確定した PricingRule schema 方針

108-10AA で、`PricingRule` の schema / index / unique 制約方針を設計した。
108-10AB で、その第一段階として `PricingRule.repairWorkNameId` を schema に追加し、`PricingRule` から `RepairWorkName` へ接続できるようにした。

追加済みの方針:

- `PricingRule.repairWorkNameId` を nullable field として追加する。
- `PricingRule.repairWorkName` relation と `RepairWorkName.pricingRules` inverse relation を追加する。
- `PricingRule` は価格ルールであり、作業名マスタ本体にはしない。
- 既存の `repairWorkCategoryId` / `targetPartNameId` / `repairWorkActionId` / `detailLabel` / `suggestedWorkName` は残す。
- `suggestedWorkName` は主キー的な判定軸ではなく、display / fallback / migration compat として扱う。
- 業務 `@@unique` は初期では置かない。nullable field が多いため、同一価格ルール判定は後続 Task でアプリ側 helper に寄せる。
- Cal 設計は短期では `PricingRule.caliberId` 1 本を維持する。`caliberRole`、`movementCaliberId`、`baseMovementCaliberId` は今回追加しない。
- `customerType` は既存の nullable field を維持し、今回ロジック変更しない。
- 既存の仮 PricingRule はまだ削除していない。

108-10AB では schema / relation / index の最小実装だけを行い、以下は変更していない。

- Repair API の PricingRule 自動作成・更新
- `getPricingRules`
- `RepairEntryForm`
- seed
- DB データ
- 帳票 / PDF / LINE / 共有ページ
- PublicCase
- PartsMaster / `getPartsMatched` / PartsSearchPanel

次は、PricingRule 自動作成・更新と `getPricingRules` の構造化対応へ進む。

## 21. DB reset 後の標準部品マスタ seed 復元

ローカル DB reset 後でも、作業入力に必要な標準部品マスタは seed で復元される必要がある。

対象:

- `PartCategoryMaster`
- `PartNameMaster`
- `PartGradeMaster`

通常の `npx prisma db seed` で `prisma/seed.ts` が実行されると、`scripts/seed-part-standard-masters.ts` を通じて上記 3 テーブルを冪等に upsert する。
これにより、`RepairEntryForm` の LABOR 行で使う対象部品候補は DB reset 後も復元される。

改めて、ID の意味を混同しない。

- `targetPartNameId`: LABOR 行の作業対象部品名 ID。`PartNameMaster` 由来。
- `partsMasterId`: PART 行の実部品 ID。`PartsMaster` 由来。

今回の seed 復元方針は `PartsMaster` 検索、`getPartsMatched`、PartsSearchPanel には影響させない。

## 22. 108-10AD PricingRule 自動作成・更新での構造 field 保存

108-10AD で、Repair 新規作成 API / Repair 更新 API の PricingRule 自動作成・更新処理を、RepairLineItem 用に正規化された LABOR 行から同期する方針へ進めた。

保存する主な field:

- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `suggestedWorkName`
- `minPrice`
- `maxPrice`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`

`detailLabel` は `RepairLineItemInput.detailLabelSnapshot` から `PricingRule.detailLabel` へ保存する。`targetPartNameId` は引き続き LABOR 行の作業対象部品名 ID であり、`PartNameMaster` 由来である。PART 行の実部品 ID である `partsMasterId` とは混同しない。

`PricingRule.repairWorkNameId` は schema に存在するが、現時点では `RepairLineItem` 側に `repairWorkNameId` がないため、108-10AD では自動設定しない。既存 PricingRule を `pricingRuleId` で更新する場合も、既存の `repairWorkNameId` を不用意に null 上書きしない。

同名・同条件で構造 field が空の legacy PricingRule がある場合は、削除せず、次回保存時に構造 field を補完する。DB の業務 `@@unique` は引き続き置かず、nullable field を含む同一判定はアプリ側 helper で扱う。

未対応で後続 Task に残すもの:

- `getPricingRules` の構造 field 検索 / score 対応
- RepairEntryForm の候補表示更新
- 金額自動反映
- 代表 PricingRule seed / 仮データ再生成
- `RepairLineItem.repairWorkNameId` 追加要否の判断
## 23. 108-10AE getPricingRules 構造field / customerType score 対応

108-10AE で `getPricingRules` は既存の `brandId` / `modelId` / `caliberId` に加えて、任意の lookup options として以下を受け取れるようにした。

- `repairWorkNameId`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`
- `customerType`

候補取得は exact filter で候補を消しすぎない方針を維持する。既存の brand / model / caliber 条件で取得した候補を、Cal / model の既存優先度に加えて customerType と構造fieldの一致度で score / priority 並び替えする。
`customerType` は完全一致を generic/null より優先する。`detailLabel` は完全一致を高評価し、未設定 PricingRule は fallback として残す。

今回も schema / migration / seed / PricingRule 自動作成・更新 / RepairEntryForm UI は変更しない。
RepairEntryForm から構造fieldを `getPricingRules` に渡す UI 連携、構造field変更時の候補再取得、金額自動反映は後続Taskで扱う。
