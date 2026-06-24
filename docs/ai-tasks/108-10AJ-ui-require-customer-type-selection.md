# Task 108-10AJ-ui: 顧客種別 B2B/B2C 選択UIの明確化・必須化

作成日: 2026-06-23

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

`RepairEntryForm` の顧客種別 UI を明確化し、案件作成・顧客入力・保存・価格候補取得の前提として B2B / B2C 選択を必須にする。

## 背景

108-10AJ で `PricingRule.customerType` を `business` / `individual` で分離する方針に進めたが、画面上の「業者 / 一般」切り替えが小さく、色だけでは現在状態が分かりにくかった。

また、既存顧客候補を選択したときに option 側の `type` で `isB2B` を切り替えていたため、選択中の顧客種別と候補種別の整合が崩れる余地があった。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AJ-implement-pricing-rule-candidate-filter.md`
- `docs/ai-tasks/108-10AJ-ui-require-customer-type-selection.md`

## UI変更内容

- 顧客種別 state を `business` / `individual` / `null` で持つ。
- 新規案件の初期状態では、既存 customer type がなければ未選択にする。
- 顧客情報欄に「現在の顧客種別：業者（B2B） / 一般（B2C） / 未選択」を表示する。
- 「業者（B2B）」「一般（B2C）」を大きめのボタンとして表示し、選択状態を文字と押下状態で分かるようにする。
- 未選択時は「顧客種別を選択してください」を表示する。

## B2B/B2C選択必須化

- 未選択時は顧客検索 / 顧客入力 combobox を disabled にする。
- 未選択時は顧客 quick register を開かない。
- 未選択時に保存した場合は alert を出して保存しない。
- 未選択時は技術料の PricingRule 候補取得を行わず、`workOpts` / `rawPricingRuleCandidates` を空にする。

## 顧客候補選択との整合

- 顧客検索結果は、現在選択中の顧客種別と `Customer.type` が一致する候補だけを表示する。
- B2B選択中は `type = business` の顧客だけ表示する。
- B2C選択中は `type = individual` の顧客だけ表示する。
- 顧客候補を選択しても、フォームの顧客種別は勝手に切り替えない。
- 候補 option の `type` が不明、または現在選択中の顧客種別と違う場合は採用しない。

## 保存payload

保存payloadの `customer.type` は、選択中の顧客種別から必ず以下で送る。

- B2B: `business`
- B2C: `individual`

未選択では保存不可にしたため、フォーム側から `customer.type = null` は送らない。

## 価格候補取得への影響

- 技術料の PricingRule 候補取得は、顧客種別選択後だけ実行する。
- `getPricingRules` へ渡す `customerType` は選択中の顧客種別を使う。
- B2Bでは `business` 候補だけ、B2Cでは `individual` 候補だけを dropdown 表示する既存 filter を維持する。
- `customerType = null` の旧 PricingRule は通常候補表示に出さない。

## 維持したもの

- 処置違い候補 filter
- `suggestedWorkName + minPrice` の表示 dedupe
- 価格違い候補を残す方針
- raw候補による高信頼1件自動反映
- 手入力価格を自動上書きしない制御
- PricingRule保存時の `customerType` / `minPrice/maxPrice` identity

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- B2B/B2C derived candidate
- 候補ラベル表示
- PartsMaster検索系
- 帳票 / PDF / LINE / 共有ページ / PublicCase

## 検証結果

- `npx prisma validate`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功
- `npx prisma generate`: dev server が Prisma DLL を保持しているため EPERM で失敗。dev server は停止していない。

## 注意点 / 後続Task

- 画面確認はユーザー側で実施する。
- `customerType = null` の既存 PricingRule は旧データ / 不正データ扱いであり、今回変換・削除しない。
- B2B/B2C derived candidate と候補ラベル表示は後続Taskで扱う。
