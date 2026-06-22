# Task 108-10AI: PricingRule候補表示重複整理 実装

作成日: 2026-06-22
更新日: 2026-06-23

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

RepairEntryForm の技術料候補 dropdown で、表示上同一の PricingRule 候補が複数表示される問題を解消する。

108-10AI の責務は表示候補の重複整理と、それによって 108-10AG の高信頼1件自動反映を壊さないことに限定する。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AI-implement-pricing-rule-candidate-dedupe.md`

## 実装内容

候補配列を用途で分離した。

### rawPricingRuleCandidates

`getPricingRules` から取得し、Cal 優先取得、score 順、customerType、構造 field を保持した元候補。

108-10AG の高信頼1件自動反映判定は、この raw 候補を使う。

保持する主な field:

- `pricingRuleId`
- `price`
- `maxPrice`
- `caliberId`
- `customerType`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`

### workOpts

dropdown 表示用候補。

`suggestedWorkName + minPrice` で表示上同一の候補を collapse する。

候補クリック時は、この代表候補を使って従来どおり金額欄へ反映する。

## 表示用 collapse key

表示候補の collapse key:

```txt
suggestedWorkName
minPrice
```

同じ表示名・同じ価格の候補は1件にまとめる。

同じ表示名でも価格違いの候補は残す。

## 自動反映判定用 semantic dedupe

高信頼一致候補は raw 候補から抽出する。

ただし raw 候補側にも同名・同価格の PricingRule が複数存在する可能性があるため、高信頼候補を抽出した後に semantic dedupe する。

自動反映判定用 semantic dedupe key:

```txt
suggestedWorkName
minPrice
```

意図:

- `¥15,000` と `¥15,000` の同一高信頼候補は1件扱い
- `¥15,000` と `¥12,000` の価格違い候補は2件扱い
- 2件扱いの場合は自動反映しない

## 高信頼1件自動反映条件

- `addItemCategory === "internal"`
- 作業カテゴリ / 対象部品 / 処置が選択済み
- `repairWorkCategoryId` が選択中の作業カテゴリと一致
- `targetPartNameId` が選択中の対象部品と一致
- `repairWorkActionId` が選択中の処置と一致
- `detailLabel` は入力がある場合のみ一致必須
- `customerType` は exact match を優先
- exact がない場合のみ generic/null を許容
- semantic dedupe 後の高信頼候補が1件だけ
- 金額欄が空、または自動反映で入った値であり、ユーザー手入力済みではない

## 変更しなかったもの

- `src/lib/pricing-rules.ts`
- `prisma/schema.prisma`
- migration
- seed
- DB データ
- `getPricingRules` 本体
- PricingRule 自動作成・更新
- B2B/B2C derived candidate
- 候補ラベル表示
- RepairLineItem DB schema
- PartsMaster 検索系
- 帳票 / PDF / LINE / 共有ページ / PublicCase

## 分離した後続Task

保存時に同名・同条件・価格違いの PricingRule を潰さない問題は重要だが、108-10AI の責務外である。

後続Task案:

```txt
108-10AJ: PricingRule保存時に価格違い候補を潰さない
```

108-10AJ で扱う内容:

- PricingRule 自動作成・更新側の同一判定に価格を含めるか
- `pricingRuleId` 指定時に価格違い rule を上書きしない制御
- legacy rule 補完更新時に価格違い候補を潰さない制御

## canonical docs 更新内容

`docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md` に以下を反映した。

- 108-10AI は表示候補重複整理の Task であること
- raw 候補と表示候補を分離すること
- 表示候補は `suggestedWorkName + minPrice` で collapse すること
- 高信頼自動反映は raw 候補から判定し、同名・同価格の重複だけ semantic dedupe すること
- PricingRule 保存側 identity 修正は後続 Task 108-10AJ に分離すること

## 検証結果

- `npx prisma validate`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功
- `npx prisma generate`: 未完了
  - 起動中の dev server が Prisma の `query_engine-windows.dll.node` を掴んでいるため EPERM で失敗
  - 画面確認を優先し、dev server は停止していない
