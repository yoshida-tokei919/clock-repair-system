# Task 114: PartsMaster growth preview/check from repair line item

## 実装前の現状

110-4では、既存 `PartsMaster.id` がある場合に限り、Web検索中に判明した `partRef` を `PartsMaster.partRefs` へ追記できるようにした。

一方、`PartsMaster` 未登録の交換部品では、Web検索で `partRef` が判明しても、案件情報から安全に登録候補を確認する導線がなかった。

## 採用したpreview/check設計

今回のTaskでは、DB作成や確定更新を行わないpreview/checkだけを実装した。

- 入力: Repair/Watch context、Repair明細由来の部品情報、Web検索中に入力した `partRef`
- 出力: 既存 `PartsMaster` の強い一致、確認用の類似候補、新規登録候補
- DB変更: なし
- 確定処理: なし

APIは `POST /api/parts/preview` とした。

## 内装の重複判定

強い一致:

- `partType = interior`
- `movementMakerId`
- `movementCaliberId`
- `partRefs` の個別値一致

類似候補:

- `movementCaliberId + standardPartNameId`
- `standardPartNameId` がない場合のみ `movementCaliberId + nameJp`

`baseMovementMakerId` / `baseMovementCaliberId` は候補表示contextには含めるが、強い一致キーにはしていない。

内装previewの候補contextには `watchRef` / `model` / 時計側 `brand` を使わない。表示も `movementMaker` / `movementCaliber` を主軸にする。

## 外装の重複判定

強い一致:

- `partType = exterior`
- `brandId`
- `partRefs` の個別値一致

類似候補:

- `brandId + watchRef + standardPartNameId`
- `brandId + modelId + standardPartNameId`
- `standardPartNameId` がない場合のみ `brandId + nameJp`

`watchRef` と `model` は外装部品の候補確認contextとして扱う。自動確定キーにはしていない。

## partRef比較ルール

Task 113の保守的な比較を維持する。

- 比較前処理は `trim()` のみ
- `-` / `.` / `/` は削除しない
- punctuation removal、数字のみ化、曖昧一致、メーカー別変換は行わない
- case normalizationも追加しない

そのため、以下は同一扱いしない。

- `24-603`
- `24603`
- `24.603`
- `24/603`

## Web検索とPartsMaster判定の分離

Web検索query生成は販売ページを探すための補助であり、PartsMaster重複判定とは目的が異なる。

今回の実装では、Web検索query生成、site profile、localStorage仕様、alias/fallbackには触れていない。

## API変更

追加:

- `POST /api/parts/preview`
- `src/lib/parts-master-growth-preview.ts`

このAPIは `findMany` / `findUnique` のみを使い、`create` / `update` / `upsert` は行わない。

## UI変更

`PartsWebSearchPanel` の部品情報欄に「候補確認」ボタンを追加した。

- `PartsMaster` 選択済みの場合は従来どおり `partRef` 保存が可能
- `PartsMaster` 未選択の場合は保存不可のまま、候補確認のみ可能
- 強い一致、類似候補、新規登録候補を表示する
- 既存PartsMasterの利用確定や新規作成確定は行わない

## 今回未実装

- 新規 `PartsMaster` 作成
- 既存 `PartsMaster` への自動統合
- `RepairLineItem.partsMasterId` の確定更新
- schema変更
- migration
- PROVISIONAL / VERIFIED
- source/evidence field
- 解説書import/export
- Web検索queryロジック変更

## 次Taskで必要なこと

- 既存候補を利用する確定処理
- 新規PartsMaster作成の確定処理
- 確定後に `RepairEntryForm` の対象LineItemへ `partsMasterId` / `partRef` を反映する処理
- 必要であれば source/evidence / PROVISIONAL / VERIFIED のschema設計
