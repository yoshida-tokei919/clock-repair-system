# Task 109-3: 内装部品名 PartNameMaster seed差分実装

## 1. 目的

Task 109-2 の設計に基づき、既存 `PartCategoryMaster` / `PartNameMaster` を流用しながら、ユーザー確定済み内装部品名リストの不足分を `PartNameMaster` へseedできるようにした。

このTaskではschema変更は行わず、既存の標準部品マスタseed構造に最小差分を追加した。

## 2. 変更ファイル

```txt
src/lib/part-input-options.ts
```

標準部品マスタseedは以下の既存構造で管理されているため、`prisma/seed.ts` ではなく `src/lib/part-input-options.ts` に差分を追加した。

```txt
src/lib/part-input-options.ts
-> PART_CATEGORIES / PART_NAME_OPTIONS の定義

scripts/seed-part-standard-masters.ts
-> PartCategoryMaster / PartNameMaster / PartGradeMaster をkey upsert
```

## 3. 追加した PartNameMaster seed差分

今回追加したのは、ユーザー確定済みリストのうち既存 `PartNameMaster` に自然な一致がなかった10件のみ。

| key | nameJa | categoryKey | categoryName | nameEn |
| --- | --- | --- | --- | --- |
| `battery` | 電池 | `quartz` | クォーツ | Battery |
| `battery_clamp` | 電池押さえ | `quartz` | クォーツ | Battery clamp |
| `battery_clamp_screw` | 電池押さえネジ | `quartz` | クォーツ | Battery clamp screw |
| `contact_spring` | 接点バネ | `quartz` | クォーツ | Contact spring |
| `insulating_sheet` | 絶縁板 | `quartz` | クォーツ | Insulating sheet |
| `circuit_spacer` | 回路スペーサー | `quartz` | クォーツ | Circuit spacer |
| `weekday_driving_wheel` | 曜送り車 | `calendar` | カレンダー | Day driving wheel |
| `weekday_jumper` | 曜送り爪 | `calendar` | カレンダー | Day jumper |
| `rotor_staff` | ローター真 | `automatic_winding` | 自動巻 | Rotor staff |
| `rotor_staff_screw` | ローター真ネジ | `automatic_winding` | 自動巻 | Rotor staff screw |

## 4. 追加・更新した PartCategoryMaster

新規の `PartCategoryMaster` は追加していない。

今回追加した部品名は、既存カテゴリへ紐づけた。

```txt
quartz
calendar
automatic_winding
```

## 5. 既存流用した PartNameMaster

以下は既存 `PartNameMaster` をそのまま流用する方針。

| 部品名 | 既存key | categoryKey | 扱い |
| --- | --- | --- | --- |
| カンヌキバネ | `yoke_spring` | `keyless_works` | そのまま流用 |
| ゼンマイ | `mainspring` | `mainspring_barrel` | そのまま流用 |
| 五番車 | `fifth_wheel_quartz` | `quartz` | クォーツ側のみ正式参照候補として扱う |
| キャパシタ | `capacitor` | `quartz` | 二次電池・キャパシタの既存候補として扱う |
| 裏押さえ | `setting_lever_jumper` | `keyless_works` | カンヌキ押さえのalias候補 |
| 裏押さえネジ | `setting_lever_jumper_screw` | `keyless_works` | カンヌキ押さえネジのalias候補 |

## 6. 五番車の扱い

`五番車` は、正式な内装部品名リスト上ではクォーツカテゴリのみで扱う。

既存 `PartNameMaster` には2件あるが、このTaskでは新規追加していない。

```txt
fifth_wheel
-> train_wheel / 輪列 / 旧seed・旧候補・review対象

fifth_wheel_quartz
-> quartz / クォーツ / 正式参照候補
```

ユーザー確認後の最終方針として、`RepairWorkName.targetPartNameId` から五番車を参照する場合は、原則 `fifth_wheel_quartz` を使う。機械式輪列側の `fifth_wheel` は、既存データとして残すが、今回の正式な内装部品名seed差分では採用しない。

## 7. ゼンマイの扱い

`PartNameMaster` の `mainspring` は内装部品名としてそのまま流用する。

一方、`PartsMaster` に外装扱いの `ゼンマイ` が1件ある懸念は、このTaskでは修正していない。これは標準部品名seedではなく、実部品データ側の品質確認として別Taskで扱う。

## 8. alias候補として記録したもの

このTaskではalias/searchKeywords/review/sourceのschema追加は行っていない。

alias候補はMarkdown上の設計情報として残す。

| alias候補 | 正規名候補 | 既存key |
| --- | --- | --- |
| カンヌキ押さえ | 裏押さえ | `setting_lever_jumper` |
| カンヌキ押さえネジ | 裏押さえネジ | `setting_lever_jumper_screw` |
| 二次電池・キャパシタ | キャパシタ、または将来の別標準名 | `capacitor` |

## 9. ローカルDB seed実行

`.env` はリモートSupabase向きのため、ローカルDBを明示して実行した。

```txt
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/clock_repair_local?schema=public
DIRECT_URL=同上
SHADOW_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/clock_repair_shadow?schema=public
```

本番/リモートDBには触っていない。

標準部品マスタseedは `prisma db seed` ではなく、既存の専用スクリプトを実行した。

```powershell
npx ts-node --compiler-options '{\"module\":\"CommonJS\"}' scripts/seed-part-standard-masters.ts
```

実行結果:

```txt
PartCategoryMaster upserted: 16
PartNameMaster upserted: 233
PartGradeMaster upserted: 3
Done.
```

補足:

```txt
node -r ts-node/register/transpile-only scripts/seed-part-standard-masters.ts
```

はESM解決で `src/lib/part-input-options` を見つけられず失敗したため、既存 `prisma.seed` と同じCommonJS指定で実行した。

## 10. ローカルDB確認結果

ローカルDBで確認した件数:

```txt
PartNameMaster total: 233
part_internal: 160
part_external: 73
```

追加10件はすべて `part_internal` かつ `isActive = true` で確認済み。

| key | nameJa | categoryKey | categoryName | isActive |
| --- | --- | --- | --- | --- |
| `battery` | 電池 | `quartz` | クォーツ | true |
| `battery_clamp` | 電池押さえ | `quartz` | クォーツ | true |
| `battery_clamp_screw` | 電池押さえネジ | `quartz` | クォーツ | true |
| `contact_spring` | 接点バネ | `quartz` | クォーツ | true |
| `insulating_sheet` | 絶縁板 | `quartz` | クォーツ | true |
| `circuit_spacer` | 回路スペーサー | `quartz` | クォーツ | true |
| `weekday_driving_wheel` | 曜送り車 | `calendar` | カレンダー | true |
| `weekday_jumper` | 曜送り爪 | `calendar` | カレンダー | true |
| `rotor_staff` | ローター真 | `automatic_winding` | 自動巻 | true |
| `rotor_staff_screw` | ローター真ネジ | `automatic_winding` | 自動巻 | true |

既存流用対象も確認済み。

```txt
yoke_spring / カンヌキバネ
mainspring / ゼンマイ
fifth_wheel_quartz / 五番車
capacitor / キャパシタ
setting_lever_jumper / 裏押さえ
setting_lever_jumper_screw / 裏押さえネジ
```

## 11. 実行コマンド結果

```txt
npx prisma validate
-> success

npx prisma generate
-> success

npx ts-node --compiler-options '{\"module\":\"CommonJS\"}' scripts/seed-part-standard-masters.ts
-> success

npx tsc --noEmit --pretty false --incremental false
-> success
```

`npx prisma validate` はサンドボックス内でPrisma engine取得に失敗したため、承認付きで再実行して成功した。

## 12. 変更していないもの

以下は変更していない。

```txt
prisma/schema.prisma
prisma/seed.ts
scripts/seed-part-standard-masters.ts
PartsMaster
RepairWorkName seed
RepairWorkCategory
RepairWorkAction
RepairLineItem
PricingRule
API
UI
RepairEntryForm
帳票
PDF
LINE
PublicCase
migration
本番/リモートDB
```

## 13. 次Task案

次Task案:

```txt
Task 109-4:
RepairWorkName seed設計に戻る前に、RepairWorkName.targetPartNameId から参照する内装部品名の候補表を作成する。
```

または:

```txt
Task 109-4:
内装作業名seed候補と PartNameMaster の targetPartNameId 対応表を設計する。
```
