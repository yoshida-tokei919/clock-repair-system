# Task 108-10X: PricingRule短期実装 - Cal / Base Cal / Watch Cal / Calなし 優先取得

## 目的

Prisma schema（DB schema）を変更せず、RepairEntryForm（案件入力フォーム）の内装技術料候補取得を以下の優先順位に変更した。

```txt
1. movementCaliberId（実搭載Cal ID）
2. baseMovementCaliberId（Base Cal ID）
3. watch.caliberId（従来Cal ID）
4. caliberIdなし（Calなし）
```

`getPricingRules（価格候補取得）` 本体は変更せず、RepairEntryForm側で複数回呼び出して結果を統合する短期実装とした。

## 変更ファイル

```txt
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10X-implement-pricing-rule-cal-base-cal-priority.md
```

## 変更内容

RepairEntryForm の `addItemCategory === 'internal'` の価格候補取得処理を変更した。

変更前:

```txt
movementCaliber
→ baseMovementCaliber
→ watch.caliber
の順に1つの pricingCaliberId を決め、
getPricingRules(brandId, modelId, pricingCaliberId) を1回だけ呼ぶ
```

変更後:

```txt
movementCaliberId
baseMovementCaliberId
watchCaliberId
Calなし
の順で getPricingRules() を複数回呼び、結果を統合する
```

`getPricingRules()` の既存引数仕様は維持した。

```ts
getPricingRules(brandId, modelId, caliberId)
```

## 追加修正: 手入力の技術料行追加

108-10X実装後の画面確認で、構造化作業入力のみを入れて「＋」を押しても技術料行が追加されない問題が出た。

原因:

```txt
追加ボタンのhandlerは newItemName が空の場合に return する。
作業カテゴリ / 対象部品 / 処置 / 価格を入力しても、候補作業名を選んでいない場合は newItemName が空のままだった。
```

修正:

```txt
内装技術料行で newItemName が空の場合、
対象部品名 + 処置 + detail から作業名を補完して追加する。
```

例:

```txt
対象部品: ムーブメント
処置: オーバーホール
detail: なし
→ 明細名: ムーブメント オーバーホール
```

候補選択からの追加、部品行追加、PartsMaster検索、保存仕様は変更していない。

## 価格候補取得の優先順位

Cal ID候補は以下の順で作る。

```txt
1. movementCaliberId（実搭載Cal ID）
2. baseMovementCaliberId（Base Cal ID）
3. watchCaliberId（従来Cal ID）
```

未設定の Cal ID はスキップする。

重複する Cal ID は1回だけ検索する。

```txt
movementCaliberId と baseMovementCaliberId が同じ
→ 1回だけ検索

watchCaliberId が movementCaliberId / baseMovementCaliberId と同じ
→ 重複検索しない
```

最後に Calなし検索を1回だけ実行する。

```txt
getPricingRules(brandId, modelId, undefined)
```

## 重複排除ルール

複数回取得した PricingRule（価格ルール）は `PricingRule.id（価格ルールID）` で重複排除する。

```txt
同じ id が後順位で出た場合
→ 最初に見つかった候補を残す
```

`suggestedWorkName（候補作業名）` だけでは重複排除しない。

理由:

```txt
同じ作業名でも、Cal / Base Cal / Calなしや価格条件によって
minPrice / maxPrice が異なる可能性があるため。
```

表示順は取得優先順位を維持する。

```txt
movementCaliberId候補
baseMovementCaliberId候補
watchCaliberId候補
Calなし候補
```

## Calなし候補の扱い

Calあり候補が見つかった場合でも、Calなし候補は最後に追加する。

理由:

```txt
Cal専用価格と汎用作業価格を両方候補として見られるようにするため。
```

現行 `getPricingRules()` は、`caliberId` 指定時にも `caliberId = null` のルールを含めて返す。

そのため RepairEntryForm 側では、各検索結果を以下のように絞って統合している。

```txt
Calあり検索
→ rule.caliberId が検索対象のCal IDと一致するものだけ採用

Calなし検索
→ rule.caliberId が null のものだけ採用
```

これにより、Calなし候補が途中順位へ混ざらず、最後に1回だけ追加される。

## 変更しなかったもの

以下は変更していない。

```txt
prisma/schema.prisma
migration
seed
DB構造
getPricingRules（価格候補取得）本体
PricingRule自動作成・更新処理
Repair新規作成API
Repair更新API
customerType（顧客区分）
作業構造fieldによる絞り込み
PartsMaster検索
getPartsMatched
PartsSearchPanel
帳票
PDF
LINE
共有ページ
PublicCase
ステータスバー
見積り・修理明細の横幅
```

技術料行と部品行の分離も変更していない。

```txt
targetPartNameId（作業対象部品名ID）
→ LABOR行（技術料行）の対象部品。PartNameMaster由来。

partsMasterId（実部品ID）
→ PART行（部品行）の実部品。PartsMaster由来。
```

この扱いも変更していない。

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
# success

npx tsc --noEmit --pretty false --incremental false
# success
```

## 注意点 / 後続Task

注意点:

```txt
getPricingRules() を最大4回呼ぶため、入力中の通信回数は増える。
Calなし候補を常に追加するため、候補数が増える可能性がある。
同じ suggestedWorkName の候補が複数出る場合、現UIでは見分けにくい可能性がある。
```

後続Task候補:

```txt
customerType（顧客区分）を価格候補条件へ追加する設計
作業構造fieldによるPricingRule絞り込み
PricingRule自動作成・更新の Cal / Base Cal 対応
候補表示に Cal専用 / Base Cal / 汎用 などのmeta表示を追加
getPricingRules側の配列対応・共通化
```
