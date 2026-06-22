# Task 108-10AH: PricingRule候補の重複整理・B2B/B2C価格候補 設計

作成日: 2026-06-22

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

RepairEntryForm の技術料候補で、同じ条件・同じ名称・同じ価格の PricingRule が複数表示される問題と、B2B/B2C 価格候補の扱いを整理する。

この Task は設計のみとし、実装、schema、migration、seed、DB データ、API、UI、getPricingRules、RepairEntryForm、PricingRule 自動作成・更新処理は変更しない。

## 現在の状況

108-10AD で RepairLineItem 保存時に PricingRule へ構造 field が保存されるようになった。

- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`

108-10AE で getPricingRules は構造 field と `customerType` を score / priority に使えるようになった。

108-10AF で RepairEntryForm から getPricingRules へ現在選択中の構造 field と `customerType` を渡すようになった。

108-10AG で RepairEntryForm は高信頼一致候補が 1 件だけの場合に限り、金額欄へ自動反映するようになった。

ただし、現在の候補整理は `PricingRule.id` 単位の重複排除であり、表示上同じ候補をまとめる処理はまだない。

## 調査結果

### getPricingRules

`src/actions/master-actions.ts` の `getPricingRules` は以下を行っている。

- `brandId` を必須条件にする
- `modelId` / `caliberId` は指定値または `null` を候補に残す
- 構造 field / `customerType` は filter ではなく score として使う
- 取得後に score 降順、同点時は `id` 昇順で並べる

同一表示候補を collapse する処理はない。

### RepairEntryForm

`src/components/repairs/RepairEntryForm.tsx` は Cal 優先順に沿って getPricingRules を複数回呼ぶ。

1. 実搭載 Cal
2. Base Cal
3. Watch Cal
4. Cal なし

その後、`PricingRule.id` で重複排除して `workOpts` に変換している。

このため、同じ作業名・同じ条件・同じ価格でも、別 ID の PricingRule は表示候補として残る。

### PricingRule 自動作成・更新

`src/lib/pricing-rules.ts` の同一判定は、DB レコードとしての identity を以下で判定する。

- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `repairWorkNameId`
- `suggestedWorkName`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`

DB unique は置かず、アプリ側 helper で同一判定する方針である。

この同一判定は保存時の PricingRule identity であり、候補表示上の重複整理とは別問題として扱うべき。

### customerType

RepairEntryForm は候補取得時に以下を渡している。

- B2B: `business`
- B2C: `individual`

フォームの顧客 type も同じ値を使っている。

一方、現行の Repair API の `syncPricingRulesFromRepairLineItems` 呼び出しでは、調査時点で `customerType` を渡していない箇所が見える。これは今回の設計 Task では変更しないが、B2B/B2C 価格ルールを正しく育てるには後続 Task で確認・修正対象にする。

## 重複候補が出る理由

重複候補は主に以下で発生する。

- DB 上に同じ表示内容の PricingRule が複数存在できる
- DB unique を初期では置かない方針のため、過去データや仮データの重複が残り得る
- getPricingRules は `PricingRule.id` 単位で返すため、同一表示候補をまとめない
- RepairEntryForm 側の重複排除も `PricingRule.id` のみで、表示上の同一候補はまとめない
- `customerType = null` の generic 候補と、`business` / `individual` の明示候補が同時に候補へ残る
- Cal あり / Cal なし、model あり / model なしなど、条件の具体度が違う候補が同じ作業名・同じ価格で並ぶことがある

## 同一候補の定義

候補表示上の同一候補は、DB identity より少し広い「ユーザーが同じ候補として見る単位」で定義する。

推奨する collapse key:

```txt
displayName
price
customerPriceKind
brandId
modelScope
caliberScope
repairWorkNameId
repairWorkCategoryId
targetPartNameId
repairWorkActionId
normalizedDetailLabel
```

短期の実装では、UI 表示と自動反映に必要な最小 key として以下で始める。

```txt
label
price
customerType or derivedCustomerType
repairWorkCategoryId
targetPartNameId
repairWorkActionId
normalizedDetailLabel
```

ただし、Cal / model の具体度が違う候補は、完全に同一視すると根拠の強い候補を消す可能性がある。そのため、collapse する場合は最も優先度が高い候補を代表として残す。

代表候補の優先順:

1. 現在の `customerType` と完全一致
2. 明示 PricingRule
3. Cal 一致
4. model 一致
5. 構造 field の一致度が高い
6. ID が小さい

## 残すべき価格違い候補

同じ作業名・同じ構造条件でも、価格が違う候補は collapse しない。

残すべき例:

- B2B 標準価格と B2C 明示価格
- B2B 標準価格と B2C 推定価格
- 同じ作業でも Cal / model / customerType によって価格が違う候補
- 値引き、取引先別、履歴由来、手動調整由来など、意味のある価格差

同名・同条件・異価格の候補は、ユーザーが選ぶ必要があるため、後続 UI でラベルを付けて区別する。

## B2B/B2C 価格方針

短期方針:

- B2B 価格を base price とする
- B2C 価格は、明示 PricingRule があればそれを優先する
- B2C 明示 PricingRule がない場合だけ、B2B 価格から `B2C = B2B x 2` の推定候補を作る
- 推定 B2C 候補は初期では DB に保存せず、候補取得・表示上の derived candidate として扱う

理由:

- DB に推定価格を即保存すると、明示価格と推定価格の境界が曖昧になる
- 推定価格は後で倍率や丸め方が変わる可能性がある
- まず候補表示で区別し、明示価格として確定したタイミングで保存する方が安全

## B2C = B2B x 2 derived price 案

B2C 顧客で候補取得したときの推奨動作:

1. `customerType = individual` の明示候補を優先する
2. 明示 B2C 候補がない場合、同条件の `customerType = business` 候補から B2C 推定候補を生成する
3. `customerType = null` の generic 候補は fallback として残す
4. B2B 由来の推定候補には `derivedFromCustomerType = business` を付ける
5. 推定候補には `isDerived = true` と `priceKind = "b2c_estimated"` を付ける

初期の丸め方:

```txt
estimatedB2CPrice = businessPrice * 2
```

丸め単位は後続 Task で業務確認する。現時点では単純な整数円を想定する。

## customerType 方針

`customerType` の値は以下を正とする。

```txt
business
individual
null
```

意味:

- `business`: B2B / 業者向け明示価格
- `individual`: B2C / 一般向け明示価格
- `null`: generic / 顧客区分未設定 fallback

候補順位:

1. 現在の顧客区分と一致する明示候補
2. B2C の場合、同条件 B2B からの推定候補
3. generic 候補
4. 顧客区分が異なる明示候補

顧客区分が異なる明示候補は、通常は自動反映対象にしない。表示する場合も、ラベルで区別する。

## 候補表示ラベル案

後続 UI で候補を区別するため、候補に以下のメタ情報を持たせるとよい。

- `B2B標準`
- `B2C明示`
- `B2C推定`
- `generic`
- `Cal一致`
- `Base Cal一致`
- `Watch Cal一致`
- `Calなし`
- `model一致`
- `model共通`
- `過去修正`
- `手動価格`

この Task では UI 実装しない。

## 自動反映対象の再整理

108-10AG の自動反映は、候補が高信頼一致 1 件だけの場合に限る。

重複整理後の推奨方針:

- 同じ候補が複数 DB レコードとして存在しても、collapse 後に 1 件なら自動反映してよい
- 同じ作業名・同じ条件でも価格が複数ある場合は自動反映しない
- generic 候補だけの場合は原則自動反映しない
- B2C 明示候補が 1 件だけなら自動反映してよい
- B2C 推定候補を自動反映対象にするかは慎重に扱う

B2C 推定候補の推奨:

- 初期実装では候補表示のみとし、自動反映しない
- 業務上「B2B x 2 が十分に確定ルール」と判断できた後に、自動反映対象へ昇格する
- 自動反映する場合でも、ラベルと内部フラグで推定価格であることを保持する

手入力済み価格は引き続き自動上書きしない。

## 推奨方針

短期の推奨は以下。

1. DB unique は引き続き追加しない
2. getPricingRules の戻り値をそのまま DB レコード単位として扱う
3. RepairEntryForm または候補整形 helper で表示候補の collapse を行う
4. collapse は「同じ名前・同じ条件・同じ価格」を 1 件にまとめる
5. 異価格候補は残す
6. B2C 推定候補は DB 保存せず、derived candidate として生成する
7. B2C 推定候補は初期では自動反映対象にしない
8. candidate label / metadata を追加して、ユーザーが根拠を見分けられるようにする

## 推奨実装手順

### 108-10AI: PricingRule 候補表示重複整理

- `PricingRule.id` 重複排除は維持する
- その後に表示候補用 collapse を追加する
- 同一候補 key を定義する
- 同一候補内では最優先候補を代表として残す
- 同価格のみ collapse し、異価格は残す
- 108-10AG の自動反映判定は collapse 後の候補を使う

### 108-10AJ: B2B/B2C derived candidate 詳細設計

- B2C 推定価格の丸め
- B2B 由来候補を出す条件
- generic 候補との優先順
- 自動反映対象に含めるか
- ラベルと内部 metadata を決める

### 108-10AK: B2B/B2C derived candidate 実装

- B2C 顧客で明示 B2C がない場合、B2B から推定候補を生成する
- `isDerived` / `priceKind` / `derivedFromPricingRuleId` を候補 metadata として持つ
- DB には保存しない

### 108-10AL: 候補ラベル表示

- B2B / B2C / generic / derived / Cal 根拠を UI に表示する
- 候補選択時の保存挙動を整理する

### 108-10AM: PricingRule 保存時 customerType 確認

- Repair API の PricingRule 同期に `customerType` が渡っているか確認する
- 渡っていない箇所は最小修正する
- B2B/B2C 価格ルールが保存時に正しく育つようにする

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- DB データ
- API
- UI
- `getPricingRules`
- RepairEntryForm
- PricingRule 自動作成・更新処理
- RepairLineItem
- PartsMaster 検索系
- 帳票 / PDF / LINE / 共有ページ / PublicCase

## canonical docs 更新要否

今回は設計 docs のみで、実装方針は既存 canonical docs と矛盾しない。

そのため `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md` は更新しない。

ただし、後続で以下を実装したタイミングでは canonical docs 更新が必要。

- 表示候補 collapse 方針
- B2C 推定候補方針
- derived candidate を DB 保存しない方針
- 自動反映対象から推定候補を除外する、または含める方針

## 注意点

- `targetPartNameId` は LABOR 行の対象部品名 ID であり、PartNameMaster 由来である
- `partsMasterId` は PART 行の実部品 ID であり、PartsMaster 由来である
- この 2 つを collapse key や候補生成で混同しない
- PricingRule は作業マスタ本体ではなく、条件別価格ルールである
- RepairLineItem は案件ごとの snapshot を持つ本体である

## 検証結果

- `npx prisma validate`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功
