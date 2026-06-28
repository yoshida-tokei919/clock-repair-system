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

## 24. 108-10AF RepairEntryForm からの構造field lookup 連携

108-10AF で `RepairEntryForm` の技術料候補取得から `getPricingRules` へ、現在入力中の構造fieldを optional lookup options として渡すようにした。

渡す field:

- `repairWorkCategoryId`: `newWorkCategoryId`
- `targetPartNameId`: `newTargetPartNameId`
- `repairWorkActionId`: `newWorkActionId`
- `detailLabel`: `newWorkDetailLabel`
- `customerType`: `isB2B ? "business" : "individual"`

108-10X の Cal 優先取得は維持する。つまり movement Cal、base Cal、watch Cal、Cal なしの順で `getPricingRules` を呼び、`PricingRule.id` による重複排除も維持する。
構造fieldは候補の score / priority に使うだけで、構造fieldを選んだだけでは金額欄へ自動反映しない。金額反映は従来どおり候補を選択したときに行う。

今回も schema / migration / seed / PricingRule 自動作成・更新 / RepairLineItem DB schema / PartsMaster 検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。
金額自動反映、exact match 1件時の自動入力、候補表示 meta の追加は後続Taskで扱う。

## 25. 108-10AG exact high-confidence match 1件時の価格自動反映

108-10AG で `RepairEntryForm` は、技術料入力時に高信頼一致の `PricingRule` が1件だけに絞れる場合に限り、価格欄へ `minPrice` を自動反映するようにした。

高信頼一致の条件:

- `addItemCategory` が `internal`
- `newWorkCategoryId` が選択済みで、`PricingRule.repairWorkCategoryId` と一致
- `newTargetPartNameId` が選択済みで、`PricingRule.targetPartNameId` と一致
- `newWorkActionId` が選択済みで、`PricingRule.repairWorkActionId` と一致
- `newWorkDetailLabel` が入力されている場合のみ、`PricingRule.detailLabel` と一致
- `customerType` は exact match を優先し、exact がない場合のみ rule 側 `null` の generic 候補を許容する
- 上記の高信頼候補が1件だけ

手入力済み価格は自動上書きしない。候補を手動選択して価格欄へ反映した場合も、その後の構造field変更で勝手に上書きしない。
複数候補、構造field未分類の fallback 候補だけ、または低信頼候補では自動反映せず、従来どおり候補表示に留める。

今回も schema / migration / seed / PricingRule 自動作成・更新 / RepairLineItem DB schema / PartsMaster 検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 26. 108-10AI PricingRule候補表示の重複整理

108-10AI で `RepairEntryForm` の技術料候補表示に、表示上同一の `PricingRule` 候補を 1件へ統合する処理を追加した。

統合対象は、現在の UI で同じに見える同名・同価格の候補である。具体的には、`suggestedWorkName` と表示価格として使っている `minPrice` を正規化した key が同じ候補を 1件にまとめる。

既存の Cal 優先順、`customerType` 優先順、構造 field の score / priority を壊さないため、`PricingRule.id` による重複排除と既存の並び順を維持する。

同名でも表示価格が違う候補は統合しない。B2B/B2C 価格差、値引き、取引先別実績、過去修正価格などの可能性があるため、候補として残す。

B2B/B2C derived candidate（B2C = B2B x 2 の計算候補）と候補ラベル表示は、今回まだ実装していない。後続 Task で扱う。

108-10AI の追加修正で、価格自動反映用の raw PricingRule 候補と、ドロップダウン表示用の collapse 済み候補を分離した。108-10AG の高信頼 1件自動反映は、表示 collapse 後の候補ではなく、`getPricingRules` から取得した raw 候補を使って構造 field 完全一致を判定する。さらに raw 候補側の同名・同価格重複は、自動反映判定直前に `suggestedWorkName + minPrice` で semantic dedupe する。表示用候補は引き続き `suggestedWorkName + minPrice` で collapse し、同名・同価格の重複表示だけを消す。

PricingRule 自動作成・更新側の保存側 identity は、108-10AJ 追加修正で `customerType` と `minPrice/maxPrice` を含める最小対応を行った。B2B / B2C 派生価格や候補ラベル表示など、価格候補の追加設計は後続 Task で扱う。

## 27. 108-10AJ 技術料候補の構造field / customerType filter

108-10AJ で `RepairEntryForm` の技術料 dropdown 候補は、選択済みの構造field / `customerType` で表示候補を filter する方針へ進めた。

filter 対象:

- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`
- `customerType`

選択済みfieldだけを filter 条件にし、未選択fieldでは候補を絞らない。`detailLabel` は入力がある場合だけ正規化後の一致を要求する。顧客は必ず B2B または B2C のどちらかであるため、`customerType` は B2B では `business`、B2C では `individual` の候補だけを表示する。`customerType = null` は旧データ / 未分類データとして扱い、dropdownには表示しない。

構造fieldがすべて null の legacy/generic 候補は、`customerType` が `business` / `individual` の場合のみ、選択中の構造fieldから組み立てた表示名と `suggestedWorkName` が一致するものを fallback 表示対象にできる。`customerType = null` の legacy候補は表示しない。

`PricingRule.customerType` が null で保存されていた原因は、Repair create / update API から `syncPricingRulesFromRepairLineItems` へ `customerType` を渡していなかったこと。108-10AJ の追加修正で、Repair create API は確定済み `customer.type`、Repair update API は payload / 既存顧客の `type` から `business` / `individual` を `syncPricingRulesFromRepairLineItems` へ渡す。API 側でも `business` / `individual` 以外を `individual` に丸めず、判定不能なら保存処理を止める。同期関数側でも `customerType` が判定できない場合は PricingRule 同期を止め、null PricingRule を新規作成しない。顧客検索で既存顧客を選択した場合も、Customer.type から `isB2B` を更新する。

表示候補は filter 後も 108-10AI の方針どおり `suggestedWorkName + minPrice` で collapse する。同じ表示名・同じ価格の重複は1件にまとめ、同じ表示名でも価格違い候補は残す。

追加修正で、候補取得中に古い広い候補が `workOpts` を上書きしないよう、`RepairEntryForm` の候補取得 `useEffect` に stale request のキャンセルガードを追加した。技術料候補の再取得開始時には `workOpts` / `rawPricingRuleCandidates` を一旦クリアし、完了済みの最新 request だけを反映する。

高信頼1件時の価格自動反映は、表示用に filter / collapse した候補ではなく、`getPricingRules` から取得した raw 候補を使って判定する。これにより、表示整理で構造fieldが失われても自動反映判定へ影響しない。

B2B/B2C derived candidate、候補ラベル表示は未実装であり、後続Taskで扱う。

108-10AJ追加修正で、PricingRule保存時のidentityには `customerType` と `minPrice/maxPrice` を含める。`pricingRuleId` が指定されていても、既存ruleの `customerType` と価格が現在の保存内容と一致する場合だけupdateする。異なる `customerType`、または価格違いのruleは上書きせず、現在の条件に一致するruleを探し、なければ新規作成する。

## 28. 108-10AJ-ui 顧客種別 B2B/B2C 選択UIの明確化・必須化

顧客は必ず B2B または B2C のどちらかである。新規案件作成時、`RepairEntryForm` は顧客種別を未選択で開始できるが、未選択のまま顧客検索・顧客入力・保存・技術料の PricingRule 候補取得を進めない。

顧客情報欄では、現在の顧客種別を「業者（B2B）」「一般（B2C）」「未選択」として明示する。小さな色違い表示だけに依存せず、大きめの選択ボタンと現在状態のテキストで判断できるようにする。

B2B 選択中は `Customer.type = business` の候補だけを表示し、保存 payload の `customer.type` も `business` にする。B2C 選択中は `Customer.type = individual` の候補だけを表示し、保存 payload の `customer.type` も `individual` にする。顧客候補を選択しても、フォームの B2B/B2C 選択を勝手に切り替えない。候補 option の `type` が不明、または現在選択中の顧客種別と一致しない場合は採用しない。

未選択時は保存不可とし、`customerType = null` の PricingRule を新規作成しない。`customerType = null` の既存 PricingRule は旧データ / 不正データ扱いであり、通常 dropdown には表示しない。旧データの変換・削除は今回行わず、後続Taskで扱う。

## 29. 108-10AK 旧 customerType=null PricingRule の削除

108-10AJ 以降、PricingRule は通常保存で必ず `customerType = business` または `customerType = individual` を持つ。`customerType = null` の PricingRule は旧データ / 不正データ扱いであり、dropdown候補には表示しない。

108-10AK ではローカル仮データ整理として、`customerType = null` の PricingRule 4件を削除した。`business` / `individual` への変換は行わず、`customerType = business` / `individual` の PricingRule は削除していない。

削除後のローカルDBでは `customerType = null` の PricingRule は0件である。schema / migration / seed は変更していない。

## 30. 108-10AL 外装作業入力・RepairLineItem接続設計

108-10AL で、外装作業入力を現行の `RepairLineItem` / `PricingRule` / `PartNameMaster` / `PartsMaster` 方針へ接続する設計を追加した。

外装技術料は初期実装では `RepairLineItem.lineType = LABOR` として扱い、外装交換部品は `RepairLineItem.lineType = PART` として扱う。内装 / 外装の区別は、短期では `RepairWorkCategory.repairType = EXTERNAL`、`RepairWorkName.repairType = EXTERNAL`、入力UIモード、各 snapshot で判断する。`RepairLineItem` 自体への `repairType` / `workSide` 追加は後続 Task で最小差分を設計する。

外装対象部品名は短期では既存 `PartNameMaster` を使う。`ExternalPartNameMaster` は現時点では作らない。`RepairLineItem.targetPartNameId` は標準部品名 ID であり、`PartsMaster` ID ではない。`PartsMaster` は引き続き実部品・在庫・価格・写真・仕入先のためのマスタとして分ける。

外装入力の基本構造は、外装部品カテゴリ、外装部品名、位置 / 素材 / サイズ / 色 / バリエーション、処置、処置詳細、表示作業名、技術料、B2B/B2C表示用 snapshot とする。ただし 108-10AL では schema 追加せず、外装属性の正式 field は後続 Task で検討する。

108-10AP で外装 PricingRule 方針を変更した。外装 PricingRule 不要、外装価格候補不要、外装技術料は完全手入力のみ、という方針は撤回し、外装も `PricingRule` 候補選択式にする。外装の基本条件は `customerType + brandId + targetPartNameId + repairWorkActionId` とし、`customerType = null` fallback は禁止する。外装価格も内装と同様、価格違いを別候補として扱う。実装は後続 Task で扱う。

帳票 / 共有ページ / PublicCase は、外装作業マスタや PartsMaster を直接表示せず、`RepairLineItem` の snapshot から表示する。FMP過去案件は FMP 専用変換ルールで扱い、新アプリ通常 Repair の構造化入力とは分ける。

## 31. 108-10AM 外装カテゴリ・部品名 seed候補設計

108-10AM で、外装カテゴリ・外装部品名を短期では既存 `PartCategoryMaster` / `PartNameMaster` に載せる方針を整理した。`ExternalPartNameMaster` は作らず、`targetPartNameId` は引き続き `PartNameMaster.id` を参照する。

既存 `src/lib/part-input-options.ts` には、外装カテゴリ6件と外装部品名73件がすでに定義されている。108-10AM では、この既存候補を土台に、`サイクロプスレンズ` と `尾錠` を追加候補、`ガラス` / `ミネラルクリスタル` / `サファイアクリスタル` 表記と針系の位置属性分離を確認対象として整理した。

今回も docs 設計のみであり、seed / schema / migration / UI / API / PricingRule / PartsMaster検索系 / 帳票 / 共有ページ / PublicCase は変更しない。実装は後続 Task で扱う。

## 32. 108-10AN APPROVED 外装部品名 seed追加

108-10AN で、108-10AM の `APPROVED` 外装部品名2件だけを `src/lib/part-input-options.ts` の標準部品名 seed へ追加した。

- `cyclops_lens` / サイクロプスレンズ: `case_glass` / ケース・風防
- `tang_buckle` / 尾錠: `bracelet_band` / ブレス・バンド

尾錠はバックルへ吸収せず、サイクロプスレンズもガラスへ吸収しない。REVIEW 候補、ALIAS_ONLY 候補、外装処置、処置詳細、外装属性 field、UI、API、PricingRule、PartsMaster検索系は変更していない。

## 33. 108-10AO 外装処置・処置詳細 seed候補設計

108-10AO で、外装処置と処置詳細の seed 候補を docs 設計として整理した。実装は後続 Task とし、今回 schema / migration / seed / UI / API / PricingRule / RepairEntryForm / PartsMaster検索系 / 帳票 / 共有ページ / PublicCase は変更しない。

外装処置は短期では既存 `RepairWorkAction` を可能な限り共有する。`交換` / `取付` / `修理` / `修正` / `調整` / `製作` / `研磨` / `洗浄` / `検査` / `除去` は既存 action を使い、外装固有寄りの `加工` / `接着` / `仕上げ` / `簡易仕上げ` / `塗装` / `サビ取り` / `乾燥` / `溶接` / `ロウ付け` は後続 seed 実装候補として扱う。

処置詳細は短期では新規 master を作らず、`RepairWorkName.detailLabel` と `RepairLineItem.detailLabelSnapshot` の snapshot で扱う。将来、候補数や検索・変換要件が増えた場合に `RepairWorkActionDetailMaster` などの master 化を検討する。

## 34. 108-10AP 外装PricingRuleドリルダウン候補設計

108-10AP で、外装料金も内装と同じように `PricingRule` の価格候補をドリルダウン選択する方針へ修正した。

外装の候補取得は、短期では `customerType`、`brandId`、`modelId`、`targetPartNameId`、`repairWorkActionId` を条件にする。`customerType`、`brandId`、`targetPartNameId`、`repairWorkActionId` は必須、`modelId` は任意とする。内装では movement Cal / base Cal が重要だが、外装では `caliberId` を使わず、ブランド、モデル、外装部品名、処置、顧客種別を重視する。

外装候補取得は、モデル専用価格 `customerType + brandId + modelId + targetPartNameId + repairWorkActionId` を第1候補、同ブランド内の共通価格 `customerType + brandId + modelId = null + targetPartNameId + repairWorkActionId` を第2候補にする。`brandId = null` fallback、処置なし fallback、部品なし fallback、`customerType = null` fallback、`caliberId` による外装候補取得は行わない。

外装も将来的には PricingRule 保存対象にする。保存時は `customerType` を必須にし、価格違いは別候補として保持する。手入力済み価格は候補再取得や構造 field 変更で自動上書きしない。

今回も docs 設計のみであり、schema / migration / seed / UI / API / PricingRule 実装 / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 35. 108-10AQ 外装処置 seed追加

108-10AQ で、108-10AO の `APPROVED` 外装処置9件を `RepairWorkAction` seed へ追加した。

- `processing` / 加工
- `bonding` / 接着
- `finishing` / 仕上げ
- `light_finishing` / 簡易仕上げ
- `painting` / 塗装
- `rust_removal` / サビ取り
- `drying` / 乾燥
- `welding` / 溶接
- `brazing` / ロウ付け

`RepairWorkAction` は内装 / 外装で共有し、`side` / `repairType` は追加しない。外装 PricingRule 方針は 108-10AP の通り後続 Task で扱い、今回は PricingRule 実装を変更していない。

## 36. 108-10AR 外装PricingRule schema/API影響調査

108-10AR で、外装 PricingRule の schema / API / 保存処理への影響を調査した。実装は後続 Task で扱い、今回 schema / migration / seed / UI / API / PricingRule 実装 / RepairEntryForm は変更しない。

外装 PricingRule の短期条件は、必須 `customerType + brandId + targetPartNameId + repairWorkActionId`、任意 `modelId` とする。現行 `PricingRule` はこれらの field をすでに持つため、短期実装は schema 変更なしで開始できる見込みである。ただし `customerType = null` fallback は禁止し、候補表示にも保存にも使わない。外装では `caliberId` を使わない。

108-10AR 追加確定方針として、価格ルール取得は internal / external で分ける。内装は Cal 中心の既存 `getPricingRules()` 系を維持し、外装は専用 helper `getExternalPricingRules()` を作る。外装 helper では `customerType` を DB where に入れ、モデル専用価格を優先し、なければ `modelId = null` のブランド共通価格を候補にする。`brandId = null` fallback は不要であり、実装しない。

## 37. 108-10AS 外装PricingRule候補取得設計

108-10AS で、外装 PricingRule 候補取得の具体設計を追加した。実装は後続 Task で扱い、今回 schema / migration / seed / UI / API / PricingRule 実装 / RepairEntryForm は変更しない。

外装候補取得は専用 helper `getExternalPricingRules()` を作る方針とする。引数は `customerType`、`brandId`、`targetPartNameId`、`repairWorkActionId` を必須、`modelId` を任意とし、`caliberId` は受け取らない。`customerType` はフォーム側 filter だけでなく DB where で絞る。

外装候補の優先順位は、`modelId` 完全一致のモデル専用価格を第1候補、`modelId = null` の同ブランド共通価格を第2候補とする。`brandId = null` fallback、`customerType = null` fallback、処置なし fallback、部品なし fallback、外装での Cal fallback は行わない。

display dedupe は既存方針の `suggestedWorkName + minPrice` を外装にも適用する。同一表示名・同一価格でモデル専用価格とブランド共通価格が重なる場合は、モデル専用価格を代表にする。候補ラベルは `モデル専用` / `ブランド共通` と B2B/B2C を表示用 meta として生成する方針とする。

## 38. 108-10AT 外装作業入力UI設計

108-10AT で、`RepairEntryForm` に外装 LABOR（外装技術料行）入力を追加するための UI 方針を整理した。今回も docs-only とし、schema / migration / seed / src / API / UI / PricingRule 実装 / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

短期実装では、入力UI上のモードとして `external_labor` を追加する案を推奨する。`internal` は内装技術料、`external_labor` は外装技術料、`part_external` は外装交換部品として分ける。外装 LABOR は `RepairLineItem.lineType = LABOR`、`PricingRule` 候補選択式、`targetPartNameId = PartNameMaster.id` を使う。外装 PART の `part_external` は `RepairLineItem.lineType = PART`、`PartsMaster` 検索を使うため、外装 LABOR と混ぜない。

外装 LABOR の入力は、`customerType`、`brandId`、外装カテゴリ、`targetPartNameId`、`repairWorkActionId`、価格候補または手入力価格を必須寄りの流れにする。`modelId` は任意で使い、モデル専用価格を優先し、なければ `modelId = null` の同ブランド共通価格を候補にする。外装 LABOR では `caliberId`、Cal fallback、`brandId = null` fallback、`customerType = null` fallback、`PartsMaster` は使わない。

保存は既存 `RepairLineItem` の snapshot field を使う方針とし、初期実装は schema 変更なしで開始できる見込みである。外装属性 field、外装専用 line category、仕上げ系表示名の例外、外装カテゴリを `PartCategoryMaster` と `RepairWorkCategory.repairType = EXTERNAL` のどちらで扱うかは後続 Task で決める。
