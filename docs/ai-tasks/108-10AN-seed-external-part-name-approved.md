# Task 108-10AN: APPROVED 外装部品名 seed実装

作成日: 2026-06-26

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

108-10AM で `APPROVED` とした外装部品名2件だけを、既存の標準部品マスタ seed へ追加する。

今回も `ExternalPartNameMaster` は作らず、既存 `PartCategoryMaster` / `PartNameMaster` を使う。`targetPartNameId` は `PartNameMaster.id` を参照し、`PartsMaster.id` とは混同しない。

## 背景

108-10AL で、外装作業入力は短期では既存 `RepairLineItem` へ接続する方針にした。

108-10AM で、外装カテゴリ・部品名 seed 候補を整理し、以下2件を `APPROVED` とした。

- `cyclops_lens` / サイクロプスレンズ
- `tang_buckle` / 尾錠

標準部品マスタ seed は以下で管理されている。

```txt
src/lib/part-input-options.ts
-> PART_CATEGORIES / PART_NAME_OPTIONS

scripts/seed-part-standard-masters.ts
-> PartCategoryMaster / PartNameMaster / PartGradeMaster を key upsert

prisma/seed.ts
-> seedPartStandardMasters(prisma) を呼ぶ
```

## 実装対象

今回実装したのは、108-10AM の `APPROVED` 2件のみ。

| key | nameJa | categoryKey | categoryName | nameEn | note |
| --- | --- | --- | --- | --- | --- |
| `cyclops_lens` | サイクロプスレンズ | `case_glass` | ケース・風防 | Cyclops lens | ロレックス等の拡大レンズ。ケース・風防系の外装部品として扱う |
| `tang_buckle` | 尾錠 | `bracelet_band` | ブレス・バンド | Tang buckle | バックルへ吸収せず、独立した外装部品名として扱う |

## 実装しなかった候補

以下は今回実装していない。

- REVIEW 候補
- EXISTING 候補
- ALIAS_ONLY 候補
- 中留 -> クラスプの alias
- ガラス / 風防 / ミネラルクリスタル / サファイアクリスタルの表記整理
- 針位置系の整理
- 外装処置
- 処置詳細
- 外装属性 field
- UI
- API
- PricingRule
- PartsMaster検索
- 帳票 / PDF / LINE / 共有ページ / PublicCase

## 変更ファイル

- `src/lib/part-input-options.ts`
- `docs/ai-tasks/108-10AN-seed-external-part-name-approved.md`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`

## 追加した部品名

### サイクロプスレンズ

`case_glass` / ケース・風防カテゴリへ追加した。

```ts
["cyclops_lens", "case_glass", "サイクロプスレンズ", "Cyclops lens"]
```

サイクロプスレンズはガラスへ吸収しない。ケース・風防系の独立した外装部品名として扱う。

### 尾錠

`bracelet_band` / ブレス・バンドカテゴリへ追加した。

```ts
["tang_buckle", "bracelet_band", "尾錠", "Tang buckle"]
```

尾錠はバックルへ吸収しない。中留 -> クラスプの alias 候補も今回実装しない。

## sortOrder 方針

既存 seed は `PART_NAME_OPTIONS` の配列順から `(index + 1) * 10` で `sortOrder` を決める。

今回、既存項目の名称変更やカテゴリ変更は行わず、以下の位置へ追加した。

- `cyclops_lens`: `case_pin` の後、`other_case_part` の前
- `tang_buckle`: `buckle` の後、`spring_bar` の前

既存項目の並び替えはしていない。ただし、配列順ベースの seed であるため、追加位置より後ろの既存項目は次回 seed 時に `sortOrder` が後ろへずれる。

## 検証結果

```txt
npx tsc --noEmit --pretty false --incremental false
-> success

npx prisma validate
-> success

npx prisma db seed 1回目
-> success
-> PartNameMaster upserted: 236

npx prisma db seed 2回目
-> success
-> PartNameMaster upserted: 236

DB確認
-> cyclops_lens count: 1
-> tang_buckle count: 1
-> cyclops_lens category: case_glass / ケース・風防
-> tang_buckle category: bracelet_band / ブレス・バンド
```

補足:

- `npx prisma db seed` は最初にサンドボックス内で Prisma engine 取得が `ECONNREFUSED 127.0.0.1:9` となったため、承認付きで再実行して成功した。
- DB確認コマンドは初回、PowerShell が `$disconnect` を展開して失敗した。コマンドのエスケープ問題であり、再実行して成功した。

## 未決事項

- `ガラス` / `ミネラルクリスタル` / `サファイアクリスタル` の正式表記整理。
- 針系の位置入り key を、部品名 + 位置属性へ分けるか。
- aliases / searchKeywords / reviewStatus / source を `PartNameMaster` に持たせるか。
- 外装属性 field を `RepairLineItem` snapshot として持たせるか。

## 後続Task

- 108-10AO: 外装処置・処置詳細 seed候補設計
- 108-10AP: 外装処置・処置詳細 seed実装
- 108-10AQ: 外装属性field設計
- 108-10AR: 外装作業入力UI設計
