# Task 109-2: 内装部品名seed差分設計

## 1. 目的

ユーザー確定済みの内装部品名リストと既存 `PartNameMaster` の照合結果をもとに、既存 `PartCategoryMaster` / `PartNameMaster` を少ない修正で内装部品マスタとして使うためのseed差分を設計する。

このTaskでは設計Markdownのみを作成する。`PartNameMaster` 追加、seed変更、schema変更、DB操作は行わない。

## 2. 前提

部品マスタと作業マスタは別物として扱う。

```txt
部品マスタ
-> 部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索などのためのマスタ

作業マスタ
-> 案件入力・作業内容・処置・技術料・B2B/B2C表示名のためのマスタ
```

`RepairWorkName.targetPartNameId` は、実部品レコードである `PartsMaster` ではなく、標準部品名である `PartNameMaster.id` を任意参照する方針で進める。

## 3. 109-0 / 109-1 の結論

109-0では、既存modelは内装部品マスタの土台として流用可能と判断した。

```txt
PartCategoryMaster -> PartNameMaster -> PartsMaster の関係は自然
PartNameMaster は標準部品名として使える
PartsMaster は在庫・価格・仕入・写真などを持つ実部品レコードとして分離できている
RepairWorkName.targetPartNameId から PartNameMaster を参照できる
```

ただし、既存 `PartNameMaster` 223件をそのまま正式な内装部品マスタとして採用しない。ユーザー確定済みリストと照合し、必要な不足分・表記差分・カテゴリ懸念だけを整理する。

109-1では、以下が確認済み。

```txt
PartCategoryMaster: 16件
PartNameMaster: 223件
PartsMaster: 1件
PartGradeMaster: 3件
PartNameMaster 内装系: 150件
PartNameMaster 外装系: 73件
```

## 4. ユーザー確定済みリストの扱い

今回の設計対象は、ユーザー確定済みの内装部品名とalias確認対象のみとする。AI側で部品名候補を増やさない。

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

alias確認対象:

```txt
カンヌキ押さえ = 裏押さえ
カンヌキ押さえネジ = 裏押さえネジ
```

重点確認:

```txt
五番車
ゼンマイ
```

## 5. 既存model流用方針

推奨は、既存modelを流用し、seed内容だけを最小差分で整える方針。

```txt
PartCategoryMaster は既存カテゴリを使う
PartNameMaster は既存標準部品名を使う
PartsMaster は実部品レコードとしてそのまま分離する
RepairWorkName.targetPartNameId は PartNameMaster.id を参照する
```

109-3で実装する場合は、標準部品マスタseed元である `src/lib/part-input-options.ts` と `scripts/seed-part-standard-masters.ts` の扱いを確認し、必要最小限の差分だけを入れる。現時点では `prisma/seed.ts` に標準部品マスタseedを混ぜない方が安全。

## 6. A: 既存PartNameMasterをそのまま使う

| 部品名 | 既存key | 既存カテゴリ | 方針 |
| --- | --- | --- | --- |
| カンヌキバネ | `yoke_spring` | `keyless_works` / 針回し | そのまま使う |
| ゼンマイ | `mainspring` | `mainspring_barrel` / 動力・巻上 | PartNameMasterはそのまま使う |

`RepairWorkName.targetPartNameId` から参照する対象として問題は小さい。ゼンマイについては `PartsMaster` 側に外装扱いの実部品データが1件あるが、標準部品名 `mainspring` 自体は内装部品名として自然。

## 7. B: 表記修正 / alias候補

| 確定・確認名 | 既存key | 既存名 | 方針 |
| --- | --- | --- | --- |
| 二次電池・キャパシタ | `capacitor` | キャパシタ | aliasまたは表示名候補として扱う |
| カンヌキ押さえ | `setting_lever_jumper` | 裏押さえ | aliasとして扱う |
| カンヌキ押さえネジ | `setting_lever_jumper_screw` | 裏押さえネジ | aliasとして扱う |

現行schemaにはalias/searchKeywordsがないため、109-3ではDB schemaを増やさず、Markdownとseed設計上の対応表として残すのが安全。必要性が高まった段階でalias専用テーブルまたは検索語フィールドを検討する。

## 8. C: 新規追加候補

ユーザー確定済みリストにはあるが、既存 `PartNameMaster` に自然な完全一致がないもの。

| 追加候補 | 推奨カテゴリkey | 推奨カテゴリ名 | 備考 |
| --- | --- | --- | --- |
| 電池 | `quartz` | クォーツ | 既存に自然一致なし |
| 電池押さえ | `quartz` | クォーツ | 既存に自然一致なし |
| 接点バネ | `quartz` | クォーツ | 既存に自然一致なし |
| 絶縁板 | `quartz` | クォーツ | 既存に自然一致なし |
| 電池押さえネジ | `quartz` | クォーツ | 既存に自然一致なし |
| 曜送り車 | `calendar` | カレンダー | `day_wheel` / 曜板とは別名として扱う |
| 曜送り爪 | `calendar` | カレンダー | 既存に自然一致なし |
| 回路スペーサー | `quartz` | クォーツ | `circuit_block` / 回路とは別名として扱う |
| ローター真 | `automatic_winding` | 自動巻 | `rotor` / ローターとは別名として扱う |
| ローター真ネジ | `automatic_winding` | 自動巻 | 既存に自然一致なし |

109-3でseed差分を実装する場合は、上記だけを追加候補とし、周辺の類似部品名をAI判断で増やさない。

## 9. D: カテゴリ / 区分整理候補

| 対象 | 現状 | 推奨 |
| --- | --- | --- |
| 五番車 | `fifth_wheel` / 輪列 と `fifth_wheel_quartz` / クォーツ の2件が存在 | 初期公式参照はクォーツ側を優先。輪列側は既存候補として残し、機械式で必要になった時点で再確認 |
| ゼンマイ | PartNameMasterでは内装。PartsMasterに外装扱いの実部品1件あり | PartNameMasterは修正不要。PartsMaster側は別Taskのデータ品質問題として扱う |
| 区分値体系 | `part_internal` / `part_external` と `interior` / `exterior` が混在 | 今回は変更しない。UI/APIで混同しないよう後続で変換方針を整理 |

標準部品名マスタと実部品マスタの値体系が混ざると、検索・在庫・作業名接続で混乱しやすい。109-3では値体系そのものを変えず、標準部品名側は既存 `part_internal` / `part_external` に揃える。

## 10. E: 保留候補

| 対象 | 保留理由 |
| --- | --- |
| ムーブメント | 作業カテゴリとしては採用済みだが、標準部品名として常に必要かは別判断。ムーブメント交換や一式管理の設計と合わせて検討 |
| 二次電池・キャパシタ | 既存 `capacitor` に寄せるか、二次電池を別標準名にするか確認が必要 |
| 香箱一式 | ユーザー確定済み追加候補ではない。既存にはあるが今回の公式seed差分対象にしない |
| テンプ一式 | ユーザー確定済み追加候補ではない。今回の公式seed差分対象にしない |
| 位置別の穴石・受石・耐震部品 | 既存には細分化があるが、今回のユーザー確定済みリスト以上に増やさない |

保留候補は、削除・無効化ではなく「今回の追加対象外」として扱う。

## 11. PartCategoryMaster対応方針

内装作業カテゴリと部品カテゴリは別物だが、今回のユーザー確定済みリストは既存 `PartCategoryMaster` の内装カテゴリへ概ね対応できる。

| ユーザー側カテゴリ | 既存PartCategoryMaster key | 方針 |
| --- | --- | --- |
| 動力・巻上 | `mainspring_barrel` | 既存を使う |
| 輪列 | `train_wheel` | 既存を使う。ただし五番車初期採用は注意 |
| 脱進機 | `escapement` | 既存を使う |
| 調速機 | `balance` | 既存を使う |
| 針回し | `keyless_works` | 既存を使う |
| カレンダー | `calendar` | 既存を使う |
| 自動巻 | `automatic_winding` | 既存を使う |
| クロノグラフ | `chronograph` | 既存を使う |
| クォーツ | `quartz` | 既存を使う |
| 地板 | `main_plate` | 既存を使う |
| ムーブメント | 対応カテゴリなし | 部品カテゴリとして新設するかは保留 |

`RepairWorkCategory` の `movement` と `PartCategoryMaster` のカテゴリは同一視しない。作業分類上のムーブメントと、部品名分類上のムーブメントは責務が異なる。

## 12. 五番車の推奨扱い

109-3時点の推奨は以下。

```txt
五番車はクォーツカテゴリの `fifth_wheel_quartz` を初期公式参照候補にする。
機械式輪列カテゴリの `fifth_wheel` は既存候補として残すが、初期公式採用にはしない。
機械式で該当案件が出た場合は、伝え車 / 中間車 / 出車など既存名称で扱えるか確認し、必要時のみ再検討する。
```

このTaskでは既存 `fifth_wheel` を削除・無効化しない。seed差分実装時にも、既存DBを大きく整理せず、公式参照方針だけを明確にする。

## 13. ゼンマイの推奨扱い

`PartNameMaster` の `mainspring` は、内装部品名としてそのまま使う。

一方、`PartsMaster` にある外装扱いの `ゼンマイ` は、実部品データの品質問題として別扱いにする。

```txt
PartNameMaster.mainspring
-> 標準部品名として利用可

PartsMaster の外装ゼンマイ
-> 今回のseed差分では触らない
-> 後続の実部品データ整理Taskで確認
```

標準部品名の設計を、既存 `PartsMaster` 1件の不整合に引っ張らない。

## 14. alias/searchKeywords/review/source の扱い

109-3ではschema追加なしで進めるのが推奨。

理由:

```txt
今回必要なのはユーザー確定済みリストとの差分投入であり、alias管理基盤までは必須ではない
既存 PartNameMaster には key / nameJa / displayJa / nameEn / displayEn / sortOrder / isActive がある
alias/searchKeywords/review/source を今入れると、部品マスタ全体仕様に踏み込みすぎる
```

ただし、以下は将来検討候補として残す。

```txt
PartNameAliasMaster
PartNameMaster.searchKeywords
PartNameMaster.reviewStatus
PartNameMaster.source
```

109-3ではalias候補をMarkdown上に残し、必要な標準名の追加だけを行う。

## 15. Task 109-3 の安全な実装手順案

実装に進む場合の推奨手順:

1. `git status --short` がcleanであることを確認する。
2. `src/lib/part-input-options.ts` の `internalPartNameOptions` に、ユーザー確定済みリストの不足分だけを追加する。
3. 既存標準部品seedスクリプト `scripts/seed-part-standard-masters.ts` の挙動を変えない。
4. `.env` がリモートSupabase向きの場合は、必ず `localhost:54322/clock_repair_local` を明示してローカルDBだけにseedする。
5. `PartCategoryMaster` / `PartNameMaster` の件数と追加対象だけを確認する。
6. `RepairWorkName` seed、`RepairLineItem`、`PricingRule`、API/UI/帳票/PublicCaseには接続しない。

109-3で触る候補は以下に限定する。

```txt
src/lib/part-input-options.ts
```

必要に応じて実行する候補:

```txt
scripts/seed-part-standard-masters.ts
```

`prisma/seed.ts` には標準部品名seedを混ぜない。

## 16. 禁止事項 / 注意点

109-3へ進む場合も、以下を避ける。

```txt
ユーザー確定済みリスト以外の部品名をAI判断で追加する
既存 PartNameMaster 223件を丸ごと公式内装部品名として扱う
PartCategoryMaster と RepairWorkCategory を混同する
PartsMaster の外装ゼンマイを今回修正する
五番車の既存2件を削除・統合する
alias/searchKeywords/review/source のschemaを先に追加する
RepairWorkName seedへ同時に進む
RepairLineItem / PricingRule / API / UI / 帳票 / PublicCaseへ接続する
本番/リモートDBへseedする
migrationを作成する
```

## 17. 次Task提案

次Task案:

```txt
Task 109-3:
ユーザー確定済み内装部品名リストの不足分だけを `src/lib/part-input-options.ts` に追加し、
ローカルDBへ標準部品マスタseedを反映する。
```

109-3では、以下を明確に分けて進める。

```txt
追加するもの
-> 電池、電池押さえ、接点バネ、絶縁板、電池押さえネジ、曜送り車、曜送り爪、回路スペーサー、ローター真、ローター真ネジ

既存を使うもの
-> カンヌキバネ、ゼンマイ、五番車（クォーツ側）

alias/保留にするもの
-> 二次電池・キャパシタ、カンヌキ押さえ、カンヌキ押さえネジ、ムーブメント
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
