# Task 108-10AM: 外装カテゴリ・部品名 seed候補設計

作成日: 2026-06-26

対象ブランチ: `wip-publiccase-workmaster-20260606`

参照資料:

- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AL-design-external-work-repair-line-item-integration.md`
- `docs/ai-tasks/108-10AJ-implement-pricing-rule-candidate-filter.md`
- `docs/ai-tasks/108-10AJ-ui-require-customer-type-selection.md`
- `docs/ai-tasks/108-10AB-fix-local-seed-part-name-master.md`
- `docs/ai-tasks/109-3-seed-internal-part-name-diff.md`
- `C:\Users\yoshi\Downloads\外装作業マスタ_最新化版_20260626.md`

## 目的

外装カテゴリ・外装部品名を、既存の `PartCategoryMaster` / `PartNameMaster` へどう追加・整理するかを設計する。

今回は docs 設計のみとし、schema / migration / seed / UI / API / PricingRule / PartsMaster 検索系 / 帳票 / 共有ページ / PublicCase は変更しない。

## 背景

108-10AL で、外装作業入力は現行 `RepairLineItem` へ接続する方針になった。

108-10AL の主な前提:

- 外装技術料は `RepairLineItem.lineType = LABOR`。
- 外装交換部品は `RepairLineItem.lineType = PART`。
- 外装対象部品名は短期では既存 `PartNameMaster` を使う。
- `ExternalPartNameMaster` は初期では作らない。
- `PartsMaster` は実部品・在庫・価格・写真・仕入先用として分離する。
- 外装技術料は初期は手入力。
- 外装でも `customerType` は必ず `business` / `individual`。

今回の 108-10AM では、外装作業入力で使う `targetPartNameId` の候補として、外装カテゴリ・外装標準部品名の seed 候補を整理する。

## 固定前提

- `PartCategoryMaster` / `PartNameMaster` は標準カテゴリ・標準部品名である。
- `PartsMaster` は実部品・在庫・価格・写真・仕入先・ブランド / Ref / サイズ等の実部品マスタである。
- `RepairLineItem.targetPartNameId` は `PartNameMaster.id` であり、`PartsMaster.id` ではない。
- 外装部品名は短期では `PartNameMaster` を使う。
- `ExternalPartNameMaster` は作らない。
- FMP過去案件と新アプリ通常 Repair は分ける。
- `customerType = null` は旧データ / 不正データ扱い。

## 既存マスタ確認結果

### seed定義の所在

標準部品カテゴリ・標準部品名は以下で管理されている。

```txt
src/lib/part-input-options.ts
-> PART_CATEGORIES / PART_NAME_OPTIONS

scripts/seed-part-standard-masters.ts
-> PART_CATEGORIES / PART_NAME_OPTIONS を PartCategoryMaster / PartNameMaster / PartGradeMaster へ key upsert

prisma/seed.ts
-> seedPartStandardMasters(prisma) を呼び、通常 seed でも標準部品マスタを復元
```

`prisma/seed.ts` には `RepairWorkCategory` / `RepairWorkAction` もあるが、外装部品カテゴリ・外装部品名の候補本体は `src/lib/part-input-options.ts` 側にある。

### schema現状

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

現行 schema には `aliases` / `searchKeywords` / `reviewStatus` / `source` / `side` はない。

### 既存カテゴリ

`src/lib/part-input-options.ts` には、外装カテゴリ候補 6件がすでに存在する。

| partType | key | displayName | status | note |
| --- | --- | --- | --- | --- |
| `part_external` | `case_glass` | ケース・風防 | EXISTING | 既存 seed 定義あり |
| `part_external` | `crown_tube` | リューズ・チューブ | EXISTING | 既存 seed 定義あり |
| `part_external` | `pushers` | プッシャー | EXISTING | 既存 seed 定義あり |
| `part_external` | `bezel` | ベゼル | EXISTING | 既存 seed 定義あり |
| `part_external` | `dial_hands` | 文字盤・針 | EXISTING | 既存 seed 定義あり |
| `part_external` | `bracelet_band` | ブレス・バンド | EXISTING | 既存 seed 定義あり |

これらは、108-10AL と最新化版資料の外装カテゴリ候補と一致する。

### 既存部品名

既存 `PART_NAME_OPTIONS` には外装部品名が 73件ある。

既存外装カテゴリ別の件数:

| categoryKey | categoryName | 既存件数 | 主な内容 |
| --- | --- | ---: | --- |
| `case_glass` | ケース・風防 | 14 | ケース、裏蓋、風防、ガラス、パッキン、ネジ等 |
| `crown_tube` | リューズ・チューブ | 8 | リューズ、チューブ、パッキン等 |
| `pushers` | プッシャー | 6 | プッシャー、パッキン、チューブ、ネジ等 |
| `bezel` | ベゼル | 8 | ベゼル、インサート、パッキン、ルミナスポイント等 |
| `dial_hands` | 文字盤・針 | 24 | 文字盤、インデックス、針系。現状は位置入り display が多い |
| `bracelet_band` | ブレス・バンド | 13 | ブレスレット、バンド、クラスプ、バックル、バネ棒等 |

確認上の注意点:

- `PartNameMaster.partType` は `part_external` / `part_internal`。
- `PartsMaster.partType` は `exterior` / `interior` 系で、値体系が異なる。
- `PartNameMaster` の `partType` で外装候補は絞れる。
- `PartNameMaster` には aliases がないため、表記ゆれは今回 docs 上の候補として残す。
- `dial_hands` の針候補は `handPosition` と `displayJa` を持つが、現行 schema へ seed されるのは `displayJa` までで、位置属性そのものの正規 field はない。

## 外装カテゴリ候補

今回のカテゴリ seed 候補は、既存 `PartCategoryMaster` をそのまま使う方針とする。

| key | displayName | partType | sortOrder方針 | status | note |
| --- | --- | --- | --- | --- | --- |
| `case_glass` | ケース・風防 | `part_external` | 既存順維持 | EXISTING | 外装部品のケース、裏蓋、風防、ガラス系 |
| `crown_tube` | リューズ・チューブ | `part_external` | 既存順維持 | EXISTING | リューズ、チューブ、関連パッキン |
| `pushers` | プッシャー | `part_external` | 既存順維持 | EXISTING | プッシャー関連 |
| `bezel` | ベゼル | `part_external` | 既存順維持 | EXISTING | ベゼル関連 |
| `dial_hands` | 文字盤・針 | `part_external` | 既存順維持 | EXISTING | 文字盤、インデックス、針、蓄光 |
| `bracelet_band` | ブレス・バンド | `part_external` | 既存順維持 | EXISTING | ブレスレット、バンド、クラスプ、尾錠等 |

内装カテゴリとは `partType = part_external` / `part_internal` で分離する。

`RepairWorkCategory` の外装カテゴリとは別物である。今回扱うのは部品カテゴリであり、作業カテゴリではない。

## 外装部品名候補

### ケース・風防

| partNameKey | displayName | status | note |
| --- | --- | --- | --- |
| `case` | ケース | EXISTING | 既存 |
| `case_back` | 裏蓋 | EXISTING | 既存 |
| `glass` | ガラス | REVIEW | 現状は `mineral_crystal` の `nameJa = ガラス`。ガラス汎用名を別 key にするか確認 |
| `acrylic_crystal` | 風防 | EXISTING | 現状 `nameEn = Acrylic crystal`。最新方針では風防を維持 |
| `tension_ring_acrylic_crystal` | 風防（テンションリング） | EXISTING | 既存 |
| `sapphire_crystal` | サファイアガラス | EXISTING | 既存。`Sapphire` 表記との整理は別途確認 |
| `mineral_crystal` | ミネラルクリスタル | REVIEW | 最新方針は `Mineral = ミネラルクリスタル`。既存は `nameJa = ガラス` のため seed修正要否あり |
| `mineral_glass` | ミネラルガラス | ALIAS_ONLY | 正式名候補ではなく、ミネラルクリスタルへの別名候補 |
| `sapphire_crystal_alias` | サファイアクリスタル | REVIEW | `サファイアガラス` とどちらを正式名にするか確認 |
| `crystal_gasket` | ガラスパッキン | EXISTING | 既存 |
| `crystal_plastic_gasket` | ガラスプラパッキン | EXISTING | 既存 |
| `case_back_gasket` | 裏蓋パッキン | EXISTING | 既存 |
| `case_back_plastic_gasket` | 裏蓋プラパッキン | EXISTING | 既存 |
| `case_screw` | ケースネジ | EXISTING | 既存 |
| `case_back_screw` | 裏蓋ネジ | EXISTING | 既存 |
| `case_pin` | ケースピン | EXISTING | 既存 |
| `cyclops_lens` | サイクロプスレンズ | APPROVED | 最新化版資料でケース・風防系の追加候補 |
| `other_case_part` | その他ケース部品 | EXISTING | 既存 |

### リューズ・チューブ

| partNameKey | displayName | status | note |
| --- | --- | --- | --- |
| `crown` | リューズ | EXISTING | 既存 |
| `screw_down_crown` | リューズ（ねじ込み） | EXISTING | 既存 |
| `crown_tube` | チューブ | EXISTING | 既存 |
| `crown_side_threaded_tube` | チューブ（リューズ側ねじ） | EXISTING | 既存 |
| `case_side_threaded_tube` | チューブ（ケース側ねじ） | EXISTING | 既存 |
| `double_threaded_crown_tube` | チューブ（ケース側ねじ・リューズ側ねじ） | EXISTING | 既存 |
| `crown_gasket` | リューズパッキン | EXISTING | 既存 |
| `crown_tube_gasket` | チューブパッキン | EXISTING | 既存 |

### プッシャー

| partNameKey | displayName | status | note |
| --- | --- | --- | --- |
| `pusher` | プッシャー | EXISTING | 既存。2H / 4H は部品名ではなく位置属性 |
| `pusher_gasket` | プッシャーパッキン | EXISTING | 既存 |
| `pusher_tube` | プッシャーチューブ | EXISTING | 既存 |
| `pusher_spring` | プッシャースプリング | EXISTING | 既存 |
| `pusher_screw` | プッシャーネジ | EXISTING | 既存 |
| `pusher_pin` | プッシャーピン | EXISTING | 既存 |

### ベゼル

| partNameKey | displayName | status | note |
| --- | --- | --- | --- |
| `bezel` | ベゼル | EXISTING | 既存 |
| `bezel_insert` | ベゼルインサート | EXISTING | 既存 |
| `rotating_bezel` | 回転ベゼル | EXISTING | 既存 |
| `bezel_gasket` | ベゼルパッキン | EXISTING | 既存 |
| `bezel_spring` | ベゼルスプリング | EXISTING | 既存 |
| `bezel_screw` | ベゼルネジ | EXISTING | 既存 |
| `bezel_pin` | ベゼルピン | EXISTING | 既存 |
| `luminous_pip` | ルミナスポイント | EXISTING | 既存 |

### 文字盤・針

| partNameKey | displayName | status | note |
| --- | --- | --- | --- |
| `dial` | 文字盤 | EXISTING | 既存 |
| `index` | インデックス | EXISTING | 既存。3H等は位置属性 |
| `lume` | 蓄光 | EXISTING | 既存。ただし部品名として持つか、処置詳細寄りにするかは将来確認余地あり |
| `hour_hand` | 時針 | REVIEW | 現状は `hour_hand_center` / `hour_hand_6h`。位置を属性に分けるなら base key 化を検討 |
| `minute_hand` | 分針 | REVIEW | 現状は位置入り key。base key 化を検討 |
| `second_hand` | 秒針 | REVIEW | 現状は位置入り key。base key 化を検討 |
| `chronograph_second_hand` | クロノ秒針 | REVIEW | 現状は `chronograph_second_hand_center`。位置は属性 |
| `minute_recorder_hand` | 分積算針 | REVIEW | 現状は 3H / 6H / 9H 別 key。位置は属性 |
| `hour_recorder_hand` | 時積算針 | REVIEW | 現状は 3H / 6H / 9H 別 key。位置は属性 |
| `twenty_four_hour_hand` | 24時間針 | REVIEW | 現状は center / 6H 別 key。位置は属性 |
| `gmt_hand` | GMT針 | REVIEW | 現状は `gmt_hand_center`。位置は属性 |
| `pointer_hand` | 指示針 | REVIEW | 現状は 3H / 6H / 9H / 12H 別 key。位置は属性 |

### ブレス・バンド

| partNameKey | displayName | status | note |
| --- | --- | --- | --- |
| `bracelet` | ブレスレット | EXISTING | 既存 |
| `strap` | バンド | EXISTING | 既存 |
| `link` | コマ | EXISTING | 既存 |
| `clasp` | クラスプ | EXISTING | 既存。中留の正規化先候補 |
| `buckle` | バックル | EXISTING | 既存 |
| `tang_buckle` | 尾錠 | APPROVED | 最新化版資料で、バックルへ勝手に寄せない正式候補 |
| `spring_bar` | バネ棒 | EXISTING | 既存 |
| `end_link` | エンドリンク | EXISTING | 既存。フラッシュフィットとの関係は現時点では別候補として維持 |
| `flush_fit` | フラッシュフィット | EXISTING | 既存。エンドリンクへ勝手に寄せない |
| `bracelet_pin` | ピン | EXISTING | 既存 |
| `c_clip` | Cリング | EXISTING | 既存 |
| `screw_pin` | ネジピン | EXISTING | 既存 |
| `clasp_screw` | クラスプネジ | EXISTING | 既存 |
| `clasp_spring` | クラスプバネ | EXISTING | 既存 |
| `nakadome` | 中留 | ALIAS_ONLY | 正式部品名ではなくクラスプの別名候補 |

## aliases / 表記ゆれ方針

現行 `PartNameMaster` schema には aliases がない。したがって、今回の alias は seed 実装ではなく docs 上の将来方針として残す。

| alias候補 | 正規候補 | status | note |
| --- | --- | --- | --- |
| 中留 | クラスプ | ALIAS_ONLY | 正式部品名としては増やさない |
| Mineral | ミネラルクリスタル | ALIAS_ONLY | 最新化版資料の方針 |
| ミネラルガラス | ミネラルクリスタル | ALIAS_ONLY | 正式名にするかは要確認だが、初期は alias 候補 |
| Sapphire | サファイアクリスタル / サファイアガラス | REVIEW | 正式表記を確認 |
| サファイアクリスタル | サファイアガラス | REVIEW | 既存は `sapphire_crystal` / サファイアガラス |
| フラッシュフィット | エンドリンク | REVIEW | 現状は別部品として既存。別名扱いにしない |

処置の表記ゆれは `PartNameMaster` ではなく、外装処置・処置詳細 Task で扱う。

例:

- 取付け / 取り付け -> 取付
- ロー付け -> ロウ付け

## 部品属性として扱うもの

以下は `PartNameMaster.nameJa` に混ぜず、部品属性として扱う。

| 属性 | 候補 | note |
| --- | --- | --- |
| 位置 | 2H / 3H / 4H / 6H / 9H / 12H / センター | プッシャー、針、インデックス等で使用 |
| 素材 | サファイア / ミネラル / アクリル等 | 部品名と素材を自動同一視しない |
| サイズ | 径、厚み、長さ等 | 実部品検索・PartsMaster 側でも重要 |
| 色 | 黒、白、シルバー等 | 文字盤、針、ベゼル等 |
| バリエーション | 仕様違い、形状違い | 純正/FITとは別に扱う場合あり |
| グレード | 純正 / FIT / 合わせ | 既存 `PartGradeMaster` との関係を維持 |
| 仕様違い | ねじ込み、テンションリング等 | 部品名として既に分けているものもあるため要確認 |

この Task では属性 schema は作らない。

後続 Task では、少なくとも以下の field 候補を検討する。

- `externalPositionSnapshot`
- `externalMaterialSnapshot`
- `externalSizeSnapshot`
- `externalColorSnapshot`
- `externalVariantSnapshot`
- `partGradeId` / `gradeNameSnapshot` との関係

## seed候補表

分類件数:

| status | 件数 | note |
| --- | ---: | --- |
| EXISTING | 51 | 既存外装部品名として seed 定義済み |
| APPROVED | 2 | 追加候補として明確 |
| REVIEW | 12 | 表記・key・属性分離の確認が必要 |
| ALIAS_ONLY | 2 | 正式部品名ではなく別名候補 |

カテゴリは6件すべて `EXISTING`。

| categoryKey | categoryName | partNameKey | displayName | aliases | status | note |
| --- | --- | --- | --- | --- | --- | --- |
| `case_glass` | ケース・風防 | `case` | ケース |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `case_back` | 裏蓋 |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `glass` | ガラス |  | REVIEW | 既存 `mineral_crystal` の `nameJa = ガラス` との整理が必要 |
| `case_glass` | ケース・風防 | `acrylic_crystal` | 風防 |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `tension_ring_acrylic_crystal` | 風防（テンションリング） |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `sapphire_crystal` | サファイアガラス | Sapphire | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `mineral_crystal` | ミネラルクリスタル | Mineral, ミネラルガラス | REVIEW | 既存 key の日本語名変更要否あり |
| `case_glass` | ケース・風防 | `mineral_glass` | ミネラルガラス | Mineral | ALIAS_ONLY | ミネラルクリスタルの別名候補 |
| `case_glass` | ケース・風防 | `sapphire_crystal_alias` | サファイアクリスタル | Sapphire | REVIEW | サファイアガラスとの正式表記確認 |
| `case_glass` | ケース・風防 | `crystal_gasket` | ガラスパッキン |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `crystal_plastic_gasket` | ガラスプラパッキン |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `case_back_gasket` | 裏蓋パッキン |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `case_back_plastic_gasket` | 裏蓋プラパッキン |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `case_screw` | ケースネジ |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `case_back_screw` | 裏蓋ネジ |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `case_pin` | ケースピン |  | EXISTING | 既存 |
| `case_glass` | ケース・風防 | `cyclops_lens` | サイクロプスレンズ | Cyclops lens | APPROVED | 追加候補 |
| `case_glass` | ケース・風防 | `other_case_part` | その他ケース部品 |  | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `crown` | リューズ | 竜頭 | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `screw_down_crown` | リューズ（ねじ込み） |  | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `crown_tube` | チューブ |  | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `crown_side_threaded_tube` | チューブ（リューズ側ねじ） |  | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `case_side_threaded_tube` | チューブ（ケース側ねじ） |  | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `double_threaded_crown_tube` | チューブ（ケース側ねじ・リューズ側ねじ） |  | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `crown_gasket` | リューズパッキン |  | EXISTING | 既存 |
| `crown_tube` | リューズ・チューブ | `crown_tube_gasket` | チューブパッキン |  | EXISTING | 既存 |
| `pushers` | プッシャー | `pusher` | プッシャー |  | EXISTING | 既存。位置は属性 |
| `pushers` | プッシャー | `pusher_gasket` | プッシャーパッキン |  | EXISTING | 既存 |
| `pushers` | プッシャー | `pusher_tube` | プッシャーチューブ |  | EXISTING | 既存 |
| `pushers` | プッシャー | `pusher_spring` | プッシャースプリング |  | EXISTING | 既存 |
| `pushers` | プッシャー | `pusher_screw` | プッシャーネジ |  | EXISTING | 既存 |
| `pushers` | プッシャー | `pusher_pin` | プッシャーピン |  | EXISTING | 既存 |
| `bezel` | ベゼル | `bezel` | ベゼル |  | EXISTING | 既存 |
| `bezel` | ベゼル | `bezel_insert` | ベゼルインサート |  | EXISTING | 既存 |
| `bezel` | ベゼル | `rotating_bezel` | 回転ベゼル |  | EXISTING | 既存 |
| `bezel` | ベゼル | `bezel_gasket` | ベゼルパッキン |  | EXISTING | 既存 |
| `bezel` | ベゼル | `bezel_spring` | ベゼルスプリング |  | EXISTING | 既存 |
| `bezel` | ベゼル | `bezel_screw` | ベゼルネジ |  | EXISTING | 既存 |
| `bezel` | ベゼル | `bezel_pin` | ベゼルピン |  | EXISTING | 既存 |
| `bezel` | ベゼル | `luminous_pip` | ルミナスポイント |  | EXISTING | 既存 |
| `dial_hands` | 文字盤・針 | `dial` | 文字盤 |  | EXISTING | 既存 |
| `dial_hands` | 文字盤・針 | `index` | インデックス |  | EXISTING | 既存。位置は属性 |
| `dial_hands` | 文字盤・針 | `lume` | 蓄光 | 夜光 | EXISTING | 既存 |
| `dial_hands` | 文字盤・針 | `hour_hand` | 時針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `minute_hand` | 分針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `second_hand` | 秒針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `chronograph_second_hand` | クロノ秒針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `minute_recorder_hand` | 分積算針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `hour_recorder_hand` | 時積算針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `twenty_four_hour_hand` | 24時間針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `gmt_hand` | GMT針 |  | REVIEW | 既存は位置入り key |
| `dial_hands` | 文字盤・針 | `pointer_hand` | 指示針 |  | REVIEW | 既存は位置入り key |
| `bracelet_band` | ブレス・バンド | `bracelet` | ブレスレット |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `strap` | バンド |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `link` | コマ |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `clasp` | クラスプ | 中留 | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `buckle` | バックル |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `tang_buckle` | 尾錠 |  | APPROVED | バックルへ吸収しない |
| `bracelet_band` | ブレス・バンド | `spring_bar` | バネ棒 |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `end_link` | エンドリンク |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `flush_fit` | フラッシュフィット |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `bracelet_pin` | ピン |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `c_clip` | Cリング |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `screw_pin` | ネジピン |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `clasp_screw` | クラスプネジ |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `clasp_spring` | クラスプバネ |  | EXISTING | 既存 |
| `bracelet_band` | ブレス・バンド | `nakadome` | 中留 |  | ALIAS_ONLY | クラスプの別名候補 |

## 既存マスタとの差分方針

### EXISTING

既存 `src/lib/part-input-options.ts` にある外装カテゴリ・部品名は、原則 `EXISTING` とする。

ただし、針系の位置入り key は最新方針と衝突するため、部品名としての base key は `REVIEW` にする。

### APPROVED

最新化版資料で明確に追加方針があるが、既存 seed にないものは `APPROVED` とする。

今回の主な `APPROVED`:

- `cyclops_lens` / サイクロプスレンズ
- `tang_buckle` / 尾錠

### REVIEW

正式名・key・既存 seed との関係を確認したいものは `REVIEW` とする。

主な `REVIEW`:

- `glass` / ガラス
- `mineral_crystal` / ミネラルクリスタル
- `sapphire_crystal_alias` / サファイアクリスタル
- 針系 base key

### ALIAS_ONLY

正式部品名ではなく別名候補だけとして扱うものは `ALIAS_ONLY` とする。

主な `ALIAS_ONLY`:

- 中留 -> クラスプ
- ミネラルガラス -> ミネラルクリスタル

## 今回やらないこと

- seed実装
- schema変更
- migration追加
- UI実装
- API変更
- PricingRule変更
- PartsMaster検索変更
- 帳票 / PDF / LINE / 共有ページ / PublicCase変更
- 外装処置・処置詳細seed実装
- 外装価格候補実装
- `PartNameMaster` への aliases / reviewStatus / source 追加
- 外装属性 field 追加

## 後続Task

候補:

- 108-10AN: 外装カテゴリ・部品名 seed実装
- 108-10AO: 外装処置・処置詳細 seed候補設計
- 108-10AP: 外装処置・処置詳細 seed実装
- 108-10AQ: 外装属性field設計
- 108-10AR: 外装作業入力UI設計

推奨順:

```txt
1. 108-10AN: 外装カテゴリ・部品名 seed実装
2. 108-10AO: 外装処置・処置詳細 seed候補設計
3. 108-10AP: 外装処置・処置詳細 seed実装
4. 108-10AQ: 外装属性field設計
5. 108-10AR: 外装作業入力UI設計
```
