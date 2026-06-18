# Task 108-10R: RepairEntryFormのCal / Base Cal 2ブロックUIへの最小変更

## 目的

RepairEntryForm（案件入力フォーム）の時計情報欄で、Cal関連項目が重複して見える問題を、保存仕様を変えずに見た目だけ最小整理した。

## 前提commit

```txt
0673bc2 docs: design cal and base cal display
4882e9d feat: filter target parts by confirmed work category mapping
0a30b83 feat: seed movement part and additional repair actions
```

## 変更ファイル

```txt
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10R-implement-cal-base-cal-display.md
```

## 変更前UI

時計情報欄に以下が直列で並んでいた。

```txt
Cal
ムーブ製造元
ムーブCal
ベース製造元
ベースCal
```

`Cal` と `ムーブCal` が並ぶため、どちらが実搭載Calなのか分かりにくかった。

## 変更後UI

時計情報欄のCal関連項目を以下の2ブロックに整理した。

```txt
Cal
  メーカー
  Cal

Base Cal
  メーカー
  Cal
```

ユーザー向け画面ラベルとして、以下は使わない。

```txt
ムーブ製造元
ムーブCal
ベース製造元
ベースCal
```

## Cal / Base Calの意味定義

### Cal

```txt
Cal
= 実搭載Cal。
  価格候補・専用品検索・実Cal基準の部品検索に使う。
```

### Base Cal

```txt
Base Cal
= 元になったCal。
  互換部品・汎用部品検索・価格候補補助に使う。
```

重要:

```txt
Cal / Base Cal はどちらも部品検索に使う。
Base Calだけが部品探し用、という扱いにはしない。
```

## Watch.caliberId と Repair.movementCaliberId の扱い

今回のTaskでは保存仕様は変更していない。

現状の保存:

```txt
watch.caliber
→ Watch.caliberId

watch.movementMaker / watch.movementCaliber
→ Repair.movementMakerId / Repair.movementCaliberId

watch.baseMovementMaker / watch.baseMovementCaliber
→ Repair.baseMovementMakerId / Repair.baseMovementCaliberId
```

短期UI方針:

```txt
Calブロックの入力
→ 既存の movementMaker / movementCaliber state を使う

Base Calブロックの入力
→ 既存の baseMovementMaker / baseMovementCaliber state を使う
```

`watch.caliber` は既存互換のため残しており、保存payloadにも引き続き含まれる。

## viewモードでの表示仕様

`isReadOnly` の場合、Cal / Base Cal は入力欄ではなく表示行にする。

未設定値は `-` で表示する。

```txt
Cal
  メーカー   -
  Cal        -

Base Cal
  メーカー   -
  Cal        -
```

## edit/createモードでの入力仕様

edit / create モードでは、既存の `AdvancedCombobox` を使う。

```txt
Cal
  メーカー   movementMaker
  Cal        movementCaliber

Base Cal
  メーカー   baseMovementMaker
  Cal        baseMovementCaliber
```

候補取得や絞り込みは変更していない。

## fallback表示の有無

viewモードのCal表示では、`movementCaliber` が空で `watch.caliber` がある場合に、既存互換として `watch.caliber` をCal名としてfallback表示する。

同じ場合、メーカー表示は `movementMaker` が空なら時計ブランド `brand` をfallback表示する。

注意:

```txt
fallbackは表示のみ。
Repair.movementCaliberId と Watch.caliberId の同期ロジックは追加していない。
DB移行もしていない。
```

## 変更していないもの

以下は変更していない。

```txt
schema
migration
seed
DB構造
server action の保存仕様
Prisma create/update の保存仕様
PartsMaster検索
getPartsMatched
PartsSearchPanel
PricingRule
帳票
PDF
LINE
共有ページ
PublicCase
ステータスバー
写真表示
作業明細
対象部品候補絞り込み
src/lib/repair-work-target-part-filter.ts
```

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
# success

npx tsc --noEmit --pretty false --incremental false
# success
```

追加確認:

```txt
src/components/repairs/RepairEntryForm.tsx に、画面ラベルとしての
ムーブ製造元 / ムーブCal / ベース製造元 / ベースCal は残っていない。
```

dev serverでの画面確認は未実施。

## 未確認点

- dev serverで `/repairs/new` と既存案件詳細を表示し、Cal / Base Cal ブロックの実画面確認を行うこと。
- `watch.caliber` と `Repair.movementCaliberId` の同期・移行方針は別Taskで整理すること。

## 次Task候補

```txt
Task 108-10S:
PricingRuleのCal優先順位を、実Cal / Base Cal / 作業内容構造fieldに基づいて再設計する。
```

```txt
Task 108-10T:
watch.caliber と Repair.movementCaliberId の同期・移行方針を整理する。
```
