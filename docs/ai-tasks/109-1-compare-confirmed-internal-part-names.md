# Task 109-1: ユーザー確定済み内装部品名リストと既存PartNameMasterの照合

## 1. 目的

ユーザー確定済みの内装部品名リストと、既存 `PartNameMaster` を照合し、既存modelを少ない修正で使うために必要な差分を整理する。

このTaskでは部品名候補を増やさない。ユーザー確定済みリストに含まれる部品名だけを対象にする。

## 2. 前提

部品マスタと作業マスタは別物。

```txt
部品マスタ
-> 部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索などのためのマスタ

作業マスタ
-> 案件入力・作業内容・処置・技術料・B2B/B2C表示名のためのマスタ
```

`RepairWorkName.targetPartNameId` は `PartNameMaster.id` への任意参照であり、`PartsMaster` には紐づけない。

## 3. 照合対象

本Taskでは、ユーザー確定済み内装部品名として以下だけを照合対象にした。

採用済み:

```txt
ムーブメント
電池
二次電池・キャパシタ
電池押さえ
接点バネ
絶縁板
電池押さえネジ
曜送り車
曜送り爪
回路スペーサー
カンヌキバネ
ローター真
ローター真ネジ
```

要検討alias:

```txt
カンヌキ押さえ = 裏押さえ
カンヌキ押さえネジ = 裏押さえネジ
```

重点確認:

```txt
五番車
ゼンマイ
```

## 4. 照合方法

ローカルDB `localhost:54322/clock_repair_local` の `PartNameMaster` を読み取り確認した。

確認した項目:

```txt
key
partType
nameJa
displayJa
categoryKey
categoryNameJa
sortOrder
isActive
PartsMaster参照件数
RepairWorkName参照件数
```

`.env` はリモートSupabase向きのため、DB読み取り時はローカル接続先を明示した。本番/リモートDBには触っていない。

## 5. ユーザー確定済みリストの扱い

ユーザー確定済みリストを正とし、既存 `PartNameMaster` 側にある追加候補は採用提案しない。

今回の分類は、あくまで既存DBとの照合結果。

## 6. 既存PartNameMaster確認結果

109-0で確認済みのローカルDB件数:

```txt
PartCategoryMaster: 16
PartNameMaster: 223
PartsMaster: 1
PartGradeMaster: 3
```

`PartNameMaster` 内訳:

```txt
part_internal: 150
part_external: 73
```

今回照合対象に関係する既存レコード:

| key | nameJa | partType | categoryKey | categoryNameJa | 備考 |
| --- | --- | --- | --- | --- | --- |
| mainspring | ゼンマイ | part_internal | mainspring_barrel | 動力・巻上 | 重点確認対象 |
| yoke_spring | カンヌキバネ | part_internal | keyless_works | 針回し | 確定済みリストに一致 |
| setting_lever_jumper | 裏押さえ | part_internal | keyless_works | 針回し | カンヌキ押さえalias候補 |
| setting_lever_jumper_screw | 裏押さえネジ | part_internal | keyless_works | 針回し | カンヌキ押さえネジalias候補 |
| capacitor | キャパシタ | part_internal | quartz | クォーツ | 二次電池・キャパシタの一部に該当 |
| fifth_wheel | 五番車 | part_internal | train_wheel | 輪列 | 方針と衝突可能 |
| fifth_wheel_quartz | 五番車 | part_internal | quartz | クォーツ | 方針に近い |

関連語検索で見つかったが、確定済みリストとは完全一致しないもの:

| key | nameJa | categoryKey | 備考 |
| --- | --- | --- | --- |
| day_wheel | 曜板 | calendar | 曜送り車 / 曜送り爪とは別名 |
| rotor | ローター | automatic_winding | ローター真 / ローター真ネジとは別名 |
| circuit_block | 回路 | quartz | 回路スペーサーとは別名 |
| step_rotor | ステップローター | quartz | ローター真とは別概念 |

## 7. A: 既に存在し、そのまま使えそう

| 確定済み部品名 | 既存PartNameMaster | category | 判断 |
| --- | --- | --- | --- |
| カンヌキバネ | `yoke_spring` / カンヌキバネ | 針回し | そのまま使えそう |

補足:

```txt
カンヌキバネはPartNameMasterに完全一致で存在する。
RepairWorkName.targetPartNameIdとして参照しやすい。
```

## 8. B: 既に存在するが表記修正候補

| 確定済み部品名 | 既存PartNameMaster | 現在カテゴリ | 表記・扱い |
| --- | --- | --- | --- |
| 二次電池・キャパシタ | `capacitor` / キャパシタ | クォーツ | 確定名は二次電池・キャパシタ、既存名はキャパシタ。表示名またはaliasで吸収する候補 |
| カンヌキ押さえ | `setting_lever_jumper` / 裏押さえ | 針回し | aliasとして扱う候補 |
| カンヌキ押さえネジ | `setting_lever_jumper_screw` / 裏押さえネジ | 針回し | aliasとして扱う候補 |

補足:

```txt
カンヌキ押さえ = 裏押さえ
カンヌキ押さえネジ = 裏押さえネジ
```

この方針は既存PartNameMasterを活かせる。DB上にalias専用構造がないため、当面はMarkdownとseed設計で対応する。

## 9. C: 既に存在するがカテゴリ・内外装区分が怪しい

| 部品名 | 既存状態 | 懸念 |
| --- | --- | --- |
| 五番車 | `train_wheel` / 輪列 と `fifth_wheel_quartz` / クォーツ の2件が存在 | 方針ではクォーツカテゴリ採用、機械式輪列カテゴリには初期採用しないため衝突 |
| ゼンマイ | PartNameMasterでは `mainspring` / 動力・巻上 に存在 | PartsMaster側に外装扱いのゼンマイ1件があり、実部品データ側の整合が怪しい |

カテゴリ値体系の懸念:

```txt
PartCategoryMaster / PartNameMaster: part_internal / part_external
PartsMaster.partType: interior / exterior 系
PartsMaster.category: internal / external / generic 系
```

標準部品マスタと実部品マスタで値体系が違うため、後続で変換・整理方針が必要。

## 10. D: 既存にないため追加候補

以下はユーザー確定済みリストに含まれるが、既存 `PartNameMaster` に完全一致または自然な既存候補が見つからなかった。

| 確定済み部品名 | 想定カテゴリ | 既存照合結果 |
| --- | --- | --- |
| 電池 | クォーツ | 見つからない |
| 電池押さえ | クォーツ | 見つからない |
| 接点バネ | クォーツ | 見つからない |
| 絶縁板 | クォーツ | 見つからない |
| 電池押さえネジ | クォーツ | 見つからない |
| 曜送り車 | カレンダー | 見つからない |
| 曜送り爪 | カレンダー | 見つからない |
| 回路スペーサー | クォーツ | 見つからない |
| ローター真 | 自動巻 | 見つからない |
| ローター真ネジ | 自動巻 | 見つからない |

注意:

```txt
曜板、ローター、回路など近い既存名はあるが、今回の確定済み部品名とは一致しない。
AI側で近似候補を正式扱いしない。
```

## 11. E: 保留候補

| 確定済み部品名 | 保留理由 |
| --- | --- |
| ムーブメント | 作業カテゴリとしては採用済みだが、PartNameMasterの部品名として必ず持つべきかは別判断。ムーブメント全体に対する作業では、PartNameMasterを選ばなくてもよい |
| 二次電池・キャパシタ | 既存にはキャパシタのみ存在。二次電池とキャパシタを1つの標準部品名にするか、表示名/aliasで扱うか確認が必要 |

## 12. 五番車の扱い

既存 `PartNameMaster` には五番車が2件ある。

| key | nameJa | category |
| --- | --- | --- |
| fifth_wheel | 五番車 | 輪列 |
| fifth_wheel_quartz | 五番車 | クォーツ |

現行方針:

```txt
五番車はクォーツカテゴリで採用する。
機械式輪列カテゴリには初期採用しない。
```

このため、`fifth_wheel_quartz` は方針に合いやすい。一方、`fifth_wheel` は既存候補として残っているが、初期正式候補にするかは要注意。

このTaskでは削除・無効化しない。

## 13. ゼンマイの扱い

`PartNameMaster` では以下が存在する。

```txt
key: mainspring
nameJa: ゼンマイ
partType: part_internal
category: 動力・巻上
```

これは自然で、内装部品名として使えそう。

一方、`PartsMaster` に以下の1件がある。

```txt
partType: exterior
category: external
nameJp: ゼンマイ
standardPartNameId: null
gradeId: null
```

この実部品データは整合が怪しい。ただし、標準部品名マスタ設計そのものを壊す問題ではなく、既存 `PartsMaster` 1件のデータ品質問題として扱うのがよい。

このTaskでは修正しない。

## 14. カテゴリ値体系の懸念

現状、内外装区分の値体系が複数ある。

```txt
PartCategoryMaster.partType: part_internal / part_external
PartNameMaster.partType: part_internal / part_external
PartsMaster.partType: interior / exterior 系
PartsMaster.category: internal / external / generic 系
RepairWorkCategory.repairType: INTERNAL / EXTERNAL
```

今後、UI/APIで以下を混同しないようにする必要がある。

```txt
作業カテゴリの INTERNAL / EXTERNAL
部品標準マスタの part_internal / part_external
実部品の interior / exterior
既存互換 category の internal / external
```

ただし、今回の照合範囲ではschema変更は不要。

## 15. alias/searchKeywords/review/sourceの必要性

今回の照合で、以下のalias・表記ゆれが必要になりそう。

| alias候補 | 正規候補 |
| --- | --- |
| カンヌキ押さえ | 裏押さえ |
| カンヌキ押さえネジ | 裏押さえネジ |
| 二次電池・キャパシタ | キャパシタ、または新規標準名 |

現状 `PartNameMaster` にはalias/searchKeywords/review/sourceがない。

最小方針:

```txt
まずMarkdownでalias候補を記録する。
次にseed差分設計で、必要なPartNameMaster追加・表記修正・isActive整理を決める。
aliasテーブルやreviewStatus追加は、必要性が高まってから検討する。
```

## 16. 既存model流用判断への影響

既存modelは引き続き流用可能。

理由:

```txt
確定済みリストの一部は既にPartNameMasterに存在する
不足分はPartNameMasterへの追加で対応できそう
RepairWorkName.targetPartNameIdから参照する構造と合っている
PartsMaster側の実部品データとは責務分離できている
```

ただし、既存223件をそのまま正式な内装部品マスタとして採用するのは避ける。

推奨:

```txt
既存modelは使う。
中身はユーザー確定済みリストに合わせて整理する。
追加候補・alias候補・既存衝突候補を次Taskでseed設計へ落とす。
```

## 17. 次Taskへの提案

次Task案:

```txt
Task 109-2:
ユーザー確定済み内装部品名リストに基づくPartNameMaster seed差分設計を行う。
```

内容:

```txt
追加するPartNameMaster候補
既存を使うPartNameMaster候補
aliasとして扱う候補
五番車の片方をreview扱いにするか
ムーブメントをPartNameMasterに入れるか保留するか
二次電池・キャパシタを1名にするか、既存キャパシタを使うか
```

## 変更しなかったもの

以下は変更していない。

```txt
prisma/schema.prisma
prisma/seed.ts
scripts/seed-part-standard-masters.ts
src/lib/part-input-options.ts
DB
migration
API
UI
RepairEntryForm
RepairLineItem
PricingRule
帳票
PDF
LINE
PublicCase
PartCategoryMasterデータ
PartNameMasterデータ
PartsMasterデータ
RepairWorkName seed
```
