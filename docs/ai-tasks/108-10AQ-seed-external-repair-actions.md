# Task 108-10AQ: 外装処置 seed実装

## 目的

108-10AO で `APPROVED` とした外装処置9件だけを、既存の `RepairWorkAction` seed へ追加する。

今回は `RepairWorkAction` seed 追加のみとし、schema / migration / PricingRule / RepairEntryForm / UI / API / PartsMaster検索系 / 帳票 / PDF / LINE / 共有ページ / PublicCase は変更しない。

## 背景

108-10AL で、外装作業入力を `RepairLineItem` へ接続する設計を作成した。

108-10AM で、外装カテゴリ・外装部品名 seed 候補を整理した。

108-10AN で、`APPROVED` だった外装部品名2件を seed 追加した。

- `cyclops_lens` / サイクロプスレンズ / `case_glass`
- `tang_buckle` / 尾錠 / `bracelet_band`

108-10AO で、外装処置・処置詳細 seed 候補を設計した。

108-10AP で、外装も `PricingRule` 候補選択式にする方針へ変更した。ただし、今回の 108-10AQ では PricingRule 実装は変更しない。

## 実装対象

108-10AO で `APPROVED` とした外装処置9件だけを追加した。

| key | displayName |
| --- | --- |
| `processing` | 加工 |
| `bonding` | 接着 |
| `finishing` | 仕上げ |
| `light_finishing` | 簡易仕上げ |
| `painting` | 塗装 |
| `rust_removal` | サビ取り |
| `drying` | 乾燥 |
| `welding` | 溶接 |
| `brazing` | ロウ付け |

`RepairWorkAction` は内装 / 外装で共有する。`RepairWorkAction` に `side` / `repairType` / `aliases` / `reviewStatus` は追加していない。

## 実装しなかった候補

以下は `REVIEW` または `ALIAS_ONLY` として扱い、今回は seed 実装していない。

- ポリッシュ
- ライトポリッシュ
- 巻芯交換
- 巻芯延長
- 巻芯別作
- 針位置修正
- 返却
- 修理不可返却
- キャンセル返却
- ロー付け
- 錆取り
- さび取り
- サビ落とし

処置詳細マスタ、`RepairWorkActionDetailMaster`、外装 UI、外装 schema、外装 PricingRule 実装、外装価格候補取得実装も行っていない。

## 変更ファイル

- `prisma/seed.ts`
- `docs/ai-tasks/108-10AQ-seed-external-repair-actions.md`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`

## sortOrder 方針

既存 `RepairWorkAction` は 10 刻みで `sortOrder` が付与されている。

既存 action の `sortOrder` は変更せず、既存末尾の `other` / その他 / `150` の後に、今回追加した外装処置を `160` から `240` まで 10 刻みで追加した。

## 検証結果

実行結果:

- `npx tsc --noEmit --pretty false --incremental false`: success
- `npx prisma validate`: success
- `npx prisma db seed` 1回目: success
- `npx prisma db seed` 2回目: success

DB確認結果:

- `processing` / 加工: 1件
- `bonding` / 接着: 1件
- `finishing` / 仕上げ: 1件
- `light_finishing` / 簡易仕上げ: 1件
- `painting` / 塗装: 1件
- `rust_removal` / サビ取り: 1件
- `drying` / 乾燥: 1件
- `welding` / 溶接: 1件
- `brazing` / ロウ付け: 1件

2回 seed 実行後も、追加した9件はそれぞれ1件のみで重複していない。

## 後続Task

- 108-10AR: 外装PricingRule schema/API影響調査
- 108-10AS: 外装PricingRule候補取得設計
- 108-10AT: 外装作業入力UI設計
- 108-10AU: 外装PricingRule保存設計
