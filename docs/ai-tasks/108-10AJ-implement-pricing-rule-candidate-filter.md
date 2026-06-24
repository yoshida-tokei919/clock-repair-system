# Task 108-10AJ: 技術料候補の構造field / customerType フィルタ改善
作成日: 2026-06-23

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

`RepairEntryForm` の技術料候補について、選択済みの作業カテゴリ / 対象部品 / 処置 / detail / customerType に合う候補だけを dropdown に表示する。

価格違い候補は残し、同名・同価格の表示重複だけを整理する。

## 背景

108-10AE で `getPricingRules` は構造field / `customerType` を score / priority に使えるようになった。
108-10AF で `RepairEntryForm` から構造fieldを渡すようになった。
108-10AG で高信頼一致候補が1件だけの場合の価格自動反映を追加した。
108-10AI で raw 候補と display 候補を分離し、表示上同一の候補を `suggestedWorkName + minPrice` で collapse する方針に整理した。

ただし dropdown 表示では、選択済みの処置と異なる候補も広く残っていたため、表示候補側に filter を追加した。

追加画面確認で、処置「オーバーホール」選択中にも「ゼンマイ交換」が表示されることを確認した。実データではオーバーホール候補は `repairWorkActionId = 13`、ゼンマイ交換は `repairWorkActionId = 1` であり、選択済み action と明確に矛盾していた。

原因は、候補取得 `useEffect` に stale request のキャンセルがなく、構造field未選択時などの広い候補取得が後から返って `workOpts` を上書きし得ること。また、選択直後に古い `workOpts` が残るため、再取得完了前に広い候補が表示され得たこと。

追加調査で、`ムーブメント オーバーホール` の主要候補は以下だった。

| id | minPrice | customerType | repairWorkCategoryId | targetPartNameId | repairWorkActionId | detailLabel |
| --- | ---: | --- | ---: | --- | ---: | --- |
| 1 | 30000 | null | 1 | `cmql1w4sq00dbwms1eknaey3p` | 13 | null |
| 2 | 15000 | null | null | null | null | null |
| 3 | 12000 | null | 1 | `cmql1w4sq00dbwms1eknaey3p` | 13 | null |

`15000` の候補は構造fieldがすべて null の legacy/generic 候補だったため、厳格な構造field filterでは落ちていた。`12000` と `30000` は選択中の構造fieldと一致していたため残っていた。`customerType` は該当候補すべて null だったため、B2B/B2C の切替だけでは候補差が出ない。

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`
- `docs/ai-tasks/108-10AJ-implement-pricing-rule-candidate-filter.md`

## 実装方針

`getPricingRules` 本体は変更せず、`RepairEntryForm` の表示候補生成だけで filter する。

候補配列の役割分離は維持する。

- `rawPricingRuleCandidates`: `getPricingRules` から取得した元候補。高信頼1件自動反映判定に使う。
- `workOpts`: dropdown 表示用候補。構造field / `customerType` で filter した後、表示重複を collapse する。

## 構造field filter方針

選択済みfieldだけを filter 条件として扱う。

- `repairWorkCategoryId` が選択済みなら一致候補だけ表示する。別IDまたは `null` の候補は表示しない。
- `targetPartNameId` が選択済みなら一致候補だけ表示する。別IDまたは `null` の候補は表示しない。
- `repairWorkActionId` が選択済みなら一致候補だけ表示する。別IDまたは `null` の候補は表示しない。
- `detailLabel` は入力がある場合だけ正規化後の完全一致で filter する。
- 未選択fieldでは filter しない。

これにより、処置「オーバーホール」選択後は、ゼンマイ交換 / 歩度調整 / 電池交換 / 消費電流測定など別処置の候補を dropdown から除外する。

構造fieldがすべて null の legacy/generic 候補についても、`customerType = null` であれば dropdown には表示しない。今後 `customerType` が `business` / `individual` の legacy候補を扱う場合のみ、選択中の構造fieldから組み立てた表示名と `suggestedWorkName` が一致するものを fallback 表示対象にする。例: `ムーブメント オーバーホール` 選択中の typed legacy `ムーブメント オーバーホール` 候補は表示対象だが、`ゼンマイ 交換` は表示しない。

候補取得中に古い広い候補を表示しないため、技術料候補の再取得開始時に `workOpts` / `rawPricingRuleCandidates` を一旦クリアし、完了済みの最新 request だけを反映する。

## customerType filter方針

現在の顧客区分に対して、明確に違う専用候補は混ぜない。

- B2B では `customerType = business` の候補だけを表示する。
- B2C では `customerType = individual` の候補だけを表示する。
- `business` と `individual` の明確な違いは同時に表示しない。

実データ確認時点の該当 `PricingRule.customerType` はすべて `null` だった。新方針では `customerType = null` は旧データ / 未分類データであり、dropdownには表示しない。filterでは `business` / `individual` に加えて `b2b` / `b2c` 表記も正規化する。

`PricingRule.customerType` が null で保存されていた原因は、Repair create / update API から `syncPricingRulesFromRepairLineItems` へ `customerType` を渡していなかったこと。`syncPricingRulesFromRepairLineItems` 自体は `params.customerType` を受けて `PricingRule.customerType` に保存する実装だったため、API呼び出し時点で値が落ちていた。

対応として、Repair create API は確定済み `customer.type`、Repair update API は payload / 既存顧客の `type` から `business` / `individual` を `syncPricingRulesFromRepairLineItems` へ渡す。API 側でも `business` / `individual` 以外を `individual` に丸めず、判定不能なら保存処理を止める。同期関数側でも `customerType` が判定できない場合は PricingRule 同期を止め、null PricingRule を新規作成しない。

候補表示では lookup customerType と完全一致する候補だけを表示する。`customerType = null` は表示しない。

追加画面確認で、B2B の `15000` 保存後に B2C の `30000` 保存が同じ PricingRule を上書きする問題が確認された。原因は、`pricingRuleId` 指定時に既存 rule の `customerType` / 価格を確認せず、その id を直接 update していたこと。また、同一判定に価格が含まれていなかったため、同じ顧客種別内でも価格違い候補を潰す可能性があった。

対応として、PricingRule 保存時の identity に以下を含める。

- `suggestedWorkName`
- `brandId`
- `modelId`
- `caliberId`
- `customerType`
- `repairWorkCategoryId`
- `targetPartNameId`
- `repairWorkActionId`
- `detailLabel`
- `minPrice`
- `maxPrice`

`pricingRuleId` が指定されている場合でも、既存 rule の `customerType` と `minPrice/maxPrice` が現在の保存内容と一致する場合だけその rule を update する。違う場合は上書きせず、現在の `customerType` / 価格の既存 rule を探し、なければ新規作成する。

顧客検索結果の option に `type` / `id` / `prefix` / 連絡先情報を持たせ、既存顧客を選択したときに `isB2B` も更新するようにした。手動の「業者 / 一般」切替も引き続き有効。

## 表示dedupeとの関係

表示候補は filter 後に、108-10AI の方針どおり `suggestedWorkName + minPrice` で collapse する。

- 同じ表示名・同じ価格は1件にまとめる。
- 同じ表示名でも価格違いは残す。
- 代表候補は既存の並び順と構造field / `customerType` の一致度を壊さないように選ぶ。

## 自動反映との関係

108-10AG の高信頼1件自動反映は、display collapse 後の `workOpts` ではなく `rawPricingRuleCandidates` を使う方針を維持する。

そのため、dropdown 表示用の filter / collapse によって、高信頼一致判定に必要な構造fieldが失われない。

## 変更しなかったもの

- `prisma/schema.prisma`
- migration
- seed
- `getPricingRules` 本体
- PricingRule 保存側 identity
- PricingRule 保存時に価格違い候補を潰さない制御
- B2B/B2C derived candidate
- 候補ラベル表示
- RepairLineItem DB schema
- PartsMaster 検索系
- 帳票 / PDF / LINE / 共有ページ / PublicCase

## 検証結果

- `npx prisma validate`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功
- `npx prisma generate`: dev server が Prisma DLL を保持しているため EPERM。画面確認優先のため dev server は停止していない。

## 後続Task

- B2B/B2C derived candidate の設計・実装
- 候補ラベル表示
- PricingRule 保存時に価格違い候補を潰さない identity 修正
- 実データに基づく generic 候補の扱いの追加調整

## 108-10AJ-ui 追加整理

顧客種別 UI を明確化し、B2B / B2C 選択を保存・顧客検索・技術料候補取得の前提にした。

- 新規案件で既存 customer type がない場合は、顧客種別を未選択で開始する。
- 未選択時は顧客検索 / 顧客入力 / quick register / 技術料 PricingRule 候補取得を進めない。
- 未選択で保存しようとした場合は alert を出し、保存しない。
- 顧客情報欄に現在の顧客種別を「業者（B2B）」「一般（B2C）」「未選択」として表示する。
- B2B選択中は `Customer.type = business` の候補だけ、B2C選択中は `Customer.type = individual` の候補だけを表示する。
- 顧客候補を選択してもフォームの顧客種別は勝手に切り替えない。
- 候補 option の `type` が不明、または現在選択中の顧客種別と違う場合は採用しない。
- 保存 payload の `customer.type` は選択中の顧客種別から `business` / `individual` のどちらかを必ず送る。

詳細は `docs/ai-tasks/108-10AJ-ui-require-customer-type-selection.md` を参照する。
