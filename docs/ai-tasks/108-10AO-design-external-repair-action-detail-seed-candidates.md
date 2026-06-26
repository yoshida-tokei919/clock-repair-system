# Task 108-10AO: 外装処置・処置詳細 seed候補設計

## 目的

外装作業入力で使う処置と処置詳細について、既存 `RepairWorkAction` / `RepairWorkName.detailLabel` / `RepairLineItem` snapshot 方針と矛盾しない seed 候補を整理する。

今回は docs 設計のみとし、schema / migration / seed / UI / API / PricingRule / RepairEntryForm / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 背景

108-10AL で、外装作業入力は短期では既存 `RepairLineItem` に接続する方針にした。

108-10AM と 108-10AN で、外装カテゴリ・外装部品名は短期では既存 `PartCategoryMaster` / `PartNameMaster` に載せる方針とし、`APPROVED` 外装部品名2件だけを seed 追加した。

次の段階として、外装作業の「処置」と「処置詳細」をどう seed 候補化するかを整理する。

## 読んだ資料

- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AL-design-external-work-repair-line-item-integration.md`
- `docs/ai-tasks/108-10AM-design-external-part-category-name-seed-candidates.md`
- `docs/ai-tasks/108-10AN-seed-external-part-name-approved.md`
- `docs/ai-tasks/109-3-seed-internal-part-name-diff.md`
- `C:\Users\yoshi\Downloads\外装作業マスタ_最新化版_20260626.md`

指定された `docs/ai-tasks/108-9-design-internal-repair-work-name-seed-candidates.md` は現行リポジトリに存在しなかった。代わりに 108-9 系 docs の存在を確認し、構造化作業入力の前提は現行 schema と上記 docs を正とした。

## 既存実装の確認

`RepairWorkAction` は `name` が unique の共有処置マスタで、現時点では `repairType` / `side` / `aliases` / `reviewStatus` / `source` を持たない。

既存 seed は `prisma/seed.ts` で `upsert({ where: { name } })` されており、冪等である。

既存 `RepairWorkAction` は以下15件。

| key | displayName |
| --- | --- |
| `exchange` | 交換 |
| `repair` | 修理 |
| `adjust` | 調整 |
| `correction` | 修正 |
| `polish` | 研磨 |
| `clean` | 洗浄 |
| `oil` | 注油 |
| `make` | 製作 |
| `install` | 取付 |
| `remove` | 除去 |
| `hole_tightening` | 穴締め |
| `staking` | かしめ |
| `overhaul` | オーバーホール |
| `inspection` | 検査 |
| `other` | その他 |

`RepairWorkCategory` は `repairType` を持ち、内装 / 外装のカテゴリ分離に使える。現行 seed では INTERNAL カテゴリのみが定義されている。

`RepairWorkName` は `repairType`、`categoryId`、`targetPartNameId`、`actionId`、`detailLabel` を持つ。外装処置詳細を短期で扱う場合は、新しい detail master を作らず `detailLabel` を使える。

`RepairLineItem` は `repairWorkCategoryId`、`repairWorkActionId`、`targetPartNameId`、`detailLabelSnapshot` を持つ。帳票 / 共有ページ / PublicCase は引き続き snapshot を正とする。

## 推奨方針

短期は `RepairWorkAction` を内装 / 外装で共有する。

理由は、`RepairWorkAction` が現行 schema 上は repairType を持たない共有 master であり、既存の `交換` / `修理` / `調整` / `修正` / `研磨` / `洗浄` / `製作` / `取付` / `除去` / `検査` は外装でも自然に使えるため。

内装 / 外装の分離は `RepairWorkCategory.repairType`、`RepairWorkName.repairType`、入力モード、候補フィルタ、snapshot で行う。`RepairWorkAction` を外装専用に分ける schema 変更は今回不要。

ただし、外装でだけ使う可能性が高い `加工` / `接着` / `仕上げ` / `簡易仕上げ` / `塗装` / `サビ取り` / `乾燥` / `溶接` / `ロウ付け` は、後続 seed 実装で `RepairWorkAction` に追加する候補とする。

## 外装処置候補

### 分類件数

| status | count | 内容 |
| --- | ---: | --- |
| EXISTING | 10 | 既存 `RepairWorkAction` をそのまま使える候補 |
| APPROVED | 9 | 後続 seed 実装で追加してよい候補 |
| REVIEW | 9 | 処置として追加する前に分解・扱いを確認する候補 |
| ALIAS_ONLY | 6 | 正規処置へ寄せる表記ゆれ |

### EXISTING

| key | displayName | note |
| --- | --- | --- |
| `exchange` | 交換 | 外装交換でも使う |
| `install` | 取付 | 交換とは分ける |
| `repair` | 修理 | 汎用修理 |
| `correction` | 修正 | 針ハカマ修正など |
| `adjust` | 調整 | 位置・具合の調整 |
| `make` | 製作 | 別作・製作系 |
| `polish` | 研磨 | 仕上げとは分けて扱う |
| `clean` | 洗浄 | 外装洗浄でも使う |
| `inspection` | 検査 | 点検・確認系 |
| `remove` | 除去 | 折れ込み巻芯除去など |

既存 `oil` / `hole_tightening` / `staking` / `overhaul` / `other` は既存処置ではあるが、今回の外装初期候補には数えない。

### APPROVED

| proposedKey | displayName | note |
| --- | --- | --- |
| `process` | 加工 | タップ加工など。`adjust` へ吸収しない |
| `adhesion` | 接着 | 取付・修理とは分ける |
| `finishing` | 仕上げ | 研磨とは分ける。範囲は別途 snapshot/detail で扱う |
| `light_finishing` | 簡易仕上げ | 仕上げとは価格・範囲が異なるため分ける |
| `painting` | 塗装 | 針蓄光塗装など |
| `rust_removal` | サビ取り | 洗浄とは分ける |
| `drying` | 乾燥 | 水入り等の処置候補 |
| `welding` | 溶接 | 外装金属加工系 |
| `brazing` | ロウ付け | ロー付けは alias とする |

### REVIEW

| rawLabel | recommended handling |
| --- | --- |
| ポリッシュ | `研磨` か `仕上げ` かを価格・表示文脈で確認 |
| ライトポリッシュ | `簡易仕上げ` へ寄せるか確認 |
| 巻芯交換 | 外装処置ではなく、対象部品 `巻芯` + `交換` として扱うか確認 |
| 巻芯延長 | `加工` / `製作` / 専用 detail のどれにするか確認 |
| 巻芯別作 | `製作` + detail として扱うか確認 |
| 針位置修正 | 処置名にせず、針位置属性 + `修正` に分解する方針を維持 |
| 返却 | 修理処置ではなく案件結果・メモ扱い候補 |
| 修理不可返却 | 修理処置ではなく案件結果・メモ扱い候補 |
| キャンセル返却 | 修理処置ではなく案件結果・メモ扱い候補 |

### ALIAS_ONLY

| alias | canonical |
| --- | --- |
| 取り付け | 取付 |
| 取付け | 取付 |
| ロー付け | ロウ付け |
| 錆取り | サビ取り |
| さび取り | サビ取り |
| サビ落とし | サビ取り |

現行 `RepairWorkAction` には alias field がないため、今回は seed 実装しない。将来、検索候補やインポート変換で alias を扱う。

## 処置詳細候補

処置詳細は短期では独立 master を作らず、`RepairWorkName.detailLabel` と `RepairLineItem.detailLabelSnapshot` で扱う。

### APPROVED detailLabel 候補

| targetPartName | action | detailLabel | display example |
| --- | --- | --- | --- |
| 針 | 修正 | ハカマ | 針ハカマ修正 |
| 針 | 修正 | 曲がり | 針曲がり修正 |
| 針 | 修正 | 擦れ | 針擦れ修正 |
| 針 | 塗装 | 蓄光 | 針蓄光塗装 |
| リューズ | 除去 | 折れ込み巻芯 | リューズ折れ込み巻芯除去 |
| ケースネジ | 加工 | タップ | ケースネジタップ加工 |
| サイクロプスレンズ | 研磨 | 表面 | サイクロプスレンズ研磨 |

### REVIEW detailLabel 候補

| targetPartName | action | detailLabel | reason |
| --- | --- | --- | --- |
| インデックス | 取付 | 位置 | 位置は detail ではなく属性 field へ分ける可能性がある |
| プッシャー | 修理 | 位置 | 2H/4H など位置属性との分離が必要 |
| ケース | 仕上げ | ケース・ブレスレット | 作業範囲として扱うべき可能性が高い |
| ブレスレット | 簡易仕上げ | 片側 / 全体 | 作業範囲・価格例外として扱うべき可能性が高い |

## 仕上げ系の扱い

`仕上げ` と `簡易仕上げ` は処置候補としては `APPROVED` とする。ただし、実際の作業名は `ケース仕上げ`、`ブレスレット仕上げ`、`ケース・ブレスレット仕上げ` のように範囲が価格・表示に強く効く。

短期では、`RepairLineItem` の表示 snapshot と `detailLabelSnapshot` に範囲を残す。108-10AP 以降、外装価格も `PricingRule` 候補選択式へ方針変更されたため、価格は候補選択または手入力で扱う。

将来、仕上げ系の候補が増える場合は、`ExternalWorkScopeMaster` か `RepairWorkActionDetailMaster` のような別 master を検討する。初期 seed 実装で `RepairWorkAction` に範囲込みの `ケース・ブレスレット仕上げ` を直接追加しない。

## action detail master の将来案

将来 master 化する場合の候補は以下。

- `RepairWorkActionDetailMaster`
- `repairType`
- `targetPartNameId`
- `actionId`
- `detailKey`
- `displayName`
- `sortOrder`
- `isActive`
- `source`
- `reviewStatus`

短期では schema を増やさず、`RepairWorkName.detailLabel` と snapshot で進める。

## 実装対象外

この一覧は 108-10AO で実装しない範囲を示す。UI / PricingRule / schema が不要という意味ではなく、108-10AP 以降の PricingRule 方針変更と後続 Task で扱う。

- schema
- migration
- seed
- UI
- API
- PricingRule
- RepairEntryForm
- PartsMaster検索
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase
- `RepairWorkAction` の alias field 追加
- `RepairWorkAction` の repairType / side field 追加

## 検証結果

docs-only 変更のため、TypeScript / Prisma / seed は実行していない。

確認したこと:

- `RepairWorkAction` は共有 master で、外装専用 field は未実装。
- `RepairWorkCategory` は `repairType` で INTERNAL / EXTERNAL を分けられる。
- 既存 `RepairWorkAction` seed は `name` upsert で冪等。
- `RepairWorkName.detailLabel` と `RepairLineItem.detailLabelSnapshot` は処置詳細の短期受け皿として使える。

## 未決事項

- `加工` の key を `process` とするか、より明示的な `processing` とするか。
- `仕上げ` / `簡易仕上げ` を action として seed 追加したうえで、範囲をどの field / snapshot に持つか。
- `ポリッシュ` を `研磨` と `仕上げ` のどちらへ寄せるか。
- `巻芯交換` / `巻芯延長` / `巻芯別作` を外装入力でどこまで扱うか。
- alias を将来 `RepairWorkActionAlias` として持つか、検索・インポート変換だけで扱うか。

## 後続Task

- 108-10AP: 外装PricingRule方針修正・ドリルダウン価格候補設計
- 108-10AQ: 外装処置 seed実装
- 108-10AR: 外装PricingRule schema/API影響調査
- 108-10AS: 外装PricingRule候補取得設計
- 108-10AT: 外装作業入力UI設計
- 108-10AU: 外装PricingRule保存設計
