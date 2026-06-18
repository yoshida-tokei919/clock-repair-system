# Task 108-10O: 15処置 + ムーブメント部品名のseed差分追加

## 目的

Task 108-10N の調査結果に基づき、最新方針に不足していた以下のseed差分を追加した。

- RepairWorkAction（処置マスタ）3件
- PartCategoryMaster（部品カテゴリマスタ）1件
- PartNameMaster（標準部品名マスタ）1件

このTaskではschema、DB構造、API、UI、保存処理、帳票、PDF、LINE、共有ページ、PublicCaseは変更しない。

## 前提commit

作業前の直近commit:

```txt
f244934 docs: investigate action part and caliber gaps
```

## 変更ファイル

```txt
prisma/seed.ts
src/lib/part-input-options.ts
docs/ai-tasks/108-10O-seed-action-and-movement-part.md
```

## 追加した RepairWorkAction（処置マスタ）

既存12件の後ろに、以下3件を追加した。

| name | displayName | sortOrder | 扱い |
| --- | --- | ---: | --- |
| overhaul | オーバーホール | 130 | 時計修理の中心作業として独立処置にする |
| inspection | 検査 | 140 | 防水、動作、精度、消費電流などはdetailLabelで表現する |
| other | その他 | 150 | 既存処置に入らない少数作業の逃げ道にする |

既存12処置のkey、displayName、sortOrderは変更していない。

## 追加した PartCategoryMaster / PartNameMaster

`src/lib/part-input-options.ts` の内装部品カテゴリと内装部品名候補に以下を追加した。

追加した PartCategoryMaster 候補:

| key | displayName | partType | 扱い |
| --- | --- | --- | --- |
| movement | ムーブメント | part_internal | ムーブメント全体を対象部品として選ぶためのカテゴリ |

追加した PartNameMaster 候補:

| key | displayName | partType | categoryKey | 扱い |
| --- | --- | --- | --- | --- |
| movement | ムーブメント | part_internal | movement | ムーブメントカテゴリの対象部品として使うための標準部品名 |

`movement / ムーブメント` は地板ではないため、`main_plate / 地板` 配下には置かない。部品カテゴリとして `movement / ムーブメント` を追加し、部品名 `movement / ムーブメント` をそこへ紐づける。

## オーバーホールの扱い

`overhaul` は件数が多く、時計修理業務の中心作業であるため、`repair` や `adjust` のdetailではなく独立した処置として扱う。

例:

```txt
カテゴリ: ムーブメント
部品名: ムーブメント
処置: オーバーホール
詳細: なし
```

## 検査の扱い

`inspection` は、防水、動作、精度、消費電流などの検査系作業を受ける処置として扱う。検査対象の細分化は `detailLabel` で表現する。

例:

```txt
処置: 検査
詳細: 防水
```

## その他の扱い

`other` は、15処置のどれにも自然に入らない少数作業の逃げ道として扱う。通常の分類で吸収できる作業を安易に `other` に寄せない。

例:

```txt
処置: その他
詳細: 磁気抜き
```

## ムーブメント部品名の扱い

`movement / ムーブメント` は、作業カテゴリ「ムーブメント」で対象部品selectを空にしないための標準部品名として追加した。部品カテゴリも `movement / ムーブメント` とし、地板カテゴリとは分けて扱う。

例:

```txt
カテゴリ: ムーブメント
部品名: ムーブメント
処置: オーバーホール
詳細: なし
```

## ムーブメント一式を追加していないこと

今回追加したのは `ムーブメント` のみであり、`ムーブメント一式` は追加していない。

理由:

```txt
ムーブメント一式は交換単位・部品構成・在庫単位の意味が混ざりやすいため、
今回の標準部品名seed差分では正式部品名として扱わない。
```

## 変更していないもの

以下は変更していない。

```txt
schema
migration
DB構造
API
UI
RepairEntryForm
PricingRule
PartsMaster検索
getPartsMatched
PartsSearchPanel
帳票
PDF
LINE
共有ページ
PublicCase
Caliber
Brand
Model
```

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
# success

npx prisma generate
# success

npx tsc --noEmit --pretty false --incremental false
# success
```

補足:

```txt
初回の npx prisma generate は、起動中のローカルNext.js dev serverが Prisma query_engine を掴んでいたため EPERM で失敗した。
このリポジトリの dev server 関連nodeプロセスだけ停止し、再実行後に成功した。
```

`npx prisma db seed` は今回は実行していない。

理由:

```txt
このTaskの主目的はseed差分の実装であり、既存開発DBへの実データ投入は接続先安全性を明示確認したうえで行う必要があるため。
RepairWorkActionは既存のupsert形式に乗っている。
PartNameMasterは既存の src/lib/part-input-options.ts -> scripts/seed-part-standard-masters.ts の標準部品seed構造に乗っている。
```

## 未確認点

- ムーブメントカテゴリでの対象部品候補を `movement` のみにするか。
- `inspection` のdetail候補をいつマスタ化・候補化するか。

## 次Task候補

```txt
Task 108-10P:
RepairWorkAction 15件と PartCategoryMaster / PartNameMaster movement をローカルDBへseed実行し、対象部品selectでの表示を確認する。
```
