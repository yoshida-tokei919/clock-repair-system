# Task 108-10T: Cal / Base Cal のメーカー別Cal候補ドリルダウン実装

## 目的

RepairEntryForm（案件入力フォーム）の Cal / Base Cal 入力で、メーカー選択に応じて Cal 候補を絞り込むようにした。

対象:

```txt
Cal（実搭載Cal）
  メーカー
  Cal

Base Cal（ベースCal）
  メーカー
  Cal
```

このTaskでは schema / 保存処理 / PartsMaster検索 / PricingRule は変更していない。

## 前提commit

```txt
004a86e docs: design cal candidate drilldown
8137a7f feat: display cal and base cal as grouped fields
0673bc2 docs: design cal and base cal display
```

## 変更ファイル

```txt
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10T-implement-cal-candidate-drilldown.md
```

## 変更前の挙動

`masterCalOpts（全Cal候補）` は `getCalibers()` の全件を持っていた。

```txt
Cal > メーカーを ROLEX にしても、
Cal候補には ROLEX / ETA / OMEGA など全Calが表示される。

Base Cal > メーカーを ETA にしても、
Base Cal候補には全Calが表示される。
```

メーカー変更時に、既存選択中のCalが新メーカーと矛盾してもクリアされなかった。

## 変更後の挙動

`Cal（実搭載Cal）` と `Base Cal（ベースCal）` の Cal 候補を、それぞれ選択中メーカーの `Brand.id` で絞り込む。

```txt
Cal > メーカーで ROLEX を選ぶ
→ Cal候補は brandId = ROLEX のCalのみ

Base Cal > メーカーで ETA を選ぶ
→ Base Cal候補は brandId = ETA のCalのみ
```

メーカー未選択時は、従来互換として全Cal候補を表示する。

## masterCalOpts（全Cal候補）に brandId（ブランドID / メーカーID）を持たせたこと

RepairEntryForm の初回ロード時、`getCalibers()` の戻り値から `brandId` を残すようにした。

```txt
id
label
value
brandId
```

これにより、追加の server action を呼ばずに client-side filter（画面側での絞り込み）ができる。

## Cal（実搭載Cal）側の絞り込み仕様

`movementMaker` から `brandOpts` 上の `id` を取得し、`masterCalOpts` を絞り込む。

```txt
movementMakerId（CalメーカーID）がない
→ masterCalOpts（全Cal候補）を表示

movementMakerId（CalメーカーID）がある
→ brandId が movementMakerId と一致するCalだけ表示
```

`AdvancedCombobox（候補選択コンボボックス）` には `filteredMovementCalOpts` を渡す。

## Base Cal（ベースCal）側の絞り込み仕様

`baseMovementMaker` から `brandOpts` 上の `id` を取得し、`masterCalOpts` を絞り込む。

```txt
baseMovementMakerId（Base CalメーカーID）がない
→ masterCalOpts（全Cal候補）を表示

baseMovementMakerId（Base CalメーカーID）がある
→ brandId が baseMovementMakerId と一致するCalだけ表示
```

`AdvancedCombobox（候補選択コンボボックス）` には `filteredBaseMovementCalOpts` を渡す。

## メーカー変更時のCalクリア仕様

メーカー変更時、現在選択中のCalが新メーカーの候補外ならクリアする。

```txt
Cal
  メーカー: ROLEX
  Cal: 3135

メーカーを ETA に変更
→ ETA候補内に 3135 がなければ Cal をクリア
```

Base Cal も同じ。

```txt
Base Cal
  メーカー: ETA
  Cal: 2892.A2

メーカーを ROLEX に変更
→ ROLEX候補内に 2892.A2 がなければ Base Cal をクリア
```

メーカー入力が既存 `Brand` 候補と一致しない自由入力状態では、メーカー未選択扱いになり、クリアは行わない。

## 候補0件時の挙動

メーカー選択済みで、そのメーカーに紐づくCal候補が0件の場合、全件fallbackはしない。

```txt
このメーカーのCal候補は未登録です。
```

という補助表示を出す。

Base Cal も同じ。

## findOrCreateCaliber（Cal検索・作成処理）は未変更であること

`src/lib/master-normalize.ts` の `findOrCreateCaliber()` は変更していない。

108-10Sで記録した通り、現状の `findOrCreateCaliber()` は Cal 名の正規化一致をメーカー横断で探すため、同名Calが別メーカーにある場合のリスクが残る。

このTaskではそのリスクは修正せず、次Task候補として残す。

## 変更していないもの

以下は変更していない。

```txt
schema
migration
seed
DB構造
server action
Prisma create/update
保存payload
findOrCreateCaliber
PartsMaster検索
getPartsMatched
PartsSearchPanel
PricingRule
帳票
PDF
LINE
共有ページ
PublicCase
108-10Pの対象部品候補絞り込み
RepairLineItem保存仕様
EstimateItem表示仕様
```

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
# success

npx tsc --noEmit --pretty false --incremental false
# success
```

## 未確認点

dev serverでの画面確認は未実施。

画面確認ポイント:

```txt
/repairs/new
既存案件詳細 /repairs/[id]

Cal > メーカー選択時にCal候補が絞られること
Base Cal > メーカー選択時にCal候補が絞られること
メーカー変更時に候補外Calがクリアされること
メーカー選択済み + Cal候補0件で全件fallbackしないこと
```

## 次Task候補

```txt
Task 108-10U:
findOrCreateCaliber（Cal検索・作成処理）を brandId（ブランドID / メーカーID）込みで安全化する設計調査。
```

```txt
Task 108-10V:
Caliber.brandId 未設定データ、同名Cal、主要メーカー別Cal登録状況をローカルDBで確認する。
```
