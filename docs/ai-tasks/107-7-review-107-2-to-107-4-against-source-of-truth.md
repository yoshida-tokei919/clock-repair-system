# AI Task 107-7: 正本3ファイルに基づく107-2〜107-4再確認

## 概要

Task 107-6-resetで作成した正本3ファイルを基準に、Task 107-2〜107-4の設計メモを再確認した。

このTaskでは、schema/code/API/UI/seed/DB操作は行っていない。Markdown確認と最小限の注記追加のみ。

## 正本ファイル一覧

- `docs/masters/internal-work-master-design-notes.md`
- `docs/masters/external-work-master-design-notes.md`
- `docs/masters/public-case-design-notes.md`

基準方針:

- 作業マスタは入力補助・標準化の元データ。
- 帳票・共有ページに出す値は、Repair明細 / EstimateItem / RepairLineItem 側のスナップショットを正とする。
- PublicCaseは公開事例用の別スナップショット。
- 部品マスタ・作業マスタ・PricingRule・PublicCaseは別レイヤー。
- PricingRuleは価格ルールとして残し、作業マスタ本体にしない。
- FMP過去案件と新アプリ通常Repairを分ける。
- 旧Excel由来候補や107-5の大量seed案を正式マスタとして採用しない。
- schema実装にはまだ進まない。

## 107-2確認結果

対象:

- `docs/ai-tasks/107-2-compare-estimate-item-extension-vs-repair-line-item.md`

確認結果:

- `EstimateItem` 拡張案と `RepairLineItem` 新設案の比較として、今後も使える。
- 作業マスタを帳票・共有ページ・PublicCaseへ直接表示する前提にはしていない。
- PublicCaseは、Repair側の確定明細から生成する別スナップショットとして扱っている。
- `PricingRule` は価格ルールとして残し、作業マスタ本体にしない方針と矛盾しない。
- FMP過去案件と新アプリ通常Repairを分ける方針と矛盾しない。
- 推奨の「段階B案」は、正本方針と整合する。

追加した注記:

- 正本3ファイルを前提に読むこと。
- 作業マスタ・部品マスタ・PricingRule・PublicCaseは明細スナップショット設計を経由して接続すること。
- PublicCaseをRepairやEstimateItemの直表示にしないこと。

## 107-3確認結果

対象:

- `docs/ai-tasks/107-3-design-common-line-item-snapshot-fields.md`

確認結果:

- 作業名・部品名・B2B/B2C表示名・価格表示フラグを明細側へスナップショット保存する方針になっている。
- `PartsMaster.grade` / `notes2` の後読みリスクを解消する方針と整合する。
- PublicCase生成元として、Repair明細スナップショットを使う方針になっている。
- 作業マスタ現在値を帳票・共有ページで直参照する設計にはなっていない。

追加した注記:

- 正本3ファイルを前提に読むこと。
- 帳票・共有ページ・PublicCase表示時にマスタを後読みせず、明細スナップショットを正とすること。
- PublicCaseは明細スナップショットから生成する公開用の別スナップショットであること。

## 107-4確認結果

対象:

- `docs/ai-tasks/107-4-design-internal-work-master-minimum-model.md`

確認結果:

- 内装作業マスタの責務整理として、今後も参考にできる。
- `PricingRule` を作業マスタ本体にしない方針と矛盾しない。
- 作業マスタは入力補助・標準化の元データであり、帳票・共有ページは明細スナップショットを正とする方針と矛盾しない。
- ただし、`WorkCategoryMaster` / `WorkNameMaster` のモデル案が具体的に書かれているため、schema実装指示ではないことを明示する必要があった。
- 107-5の大量seed案を正式マスタとして採用しないことも明示する必要があった。

追加した注記:

- 本ファイルは内装作業マスタの最小モデル案であり、schema実装指示ではないこと。
- 旧Excel由来候補や107-5の大量seed案を正式マスタとして採用しないこと。
- 実装前に、Repair明細 / EstimateItem / RepairLineItem の受け皿方針を確定すること。

## 107-5確認結果

対象:

- `docs/ai-tasks/107-5-design-internal-work-category-and-name-seed-candidates.md`

確認結果:

- 冒頭に本線外注記が入っている。
- 大量seed方式の検討履歴として残し、最新版の内装作業マスタ設計方針では本線として採用しないことが明記されている。
- 正本3ファイルを正として扱うことが明記されている。

今回の追加修正:

- なし。

## 追加・修正した注記

今回、以下へ注記を追加した。

- `docs/ai-tasks/107-2-compare-estimate-item-extension-vs-repair-line-item.md`
- `docs/ai-tasks/107-3-design-common-line-item-snapshot-fields.md`
- `docs/ai-tasks/107-4-design-internal-work-master-minimum-model.md`

107-5は既存注記で足りていたため、今回は変更していない。

## 正本方針と矛盾しないことの確認

確認結果:

- 107-2は、明細受け皿比較として正本方針と整合する。
- 107-3は、明細スナップショット仕様として正本方針と整合する。
- 107-4は、schema実装指示ではなく設計案として扱えば正本方針と整合する。
- 107-5は、本線外の検討履歴として扱う限り正本方針と矛盾しない。

今後の注意:

- WorkCategoryMaster / WorkNameMasterをいきなりschema化しない。
- InternalWorkMaster / ExternalWorkMasterをいきなりschema化しない。
- PricingRuleを作業マスタ本体として使わない。
- 旧Excel由来候補や107-5の大量seed案をそのまま正式マスタにしない。
- FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込まない。
- 帳票・共有ページ・PublicCaseでマスタを直参照して表示しない。

## 次Task案

Task 107-8:

最新版正本に基づき、`EstimateItem` 拡張案 vs `RepairLineItem` 新設案の結論を確定する。

または、107-2ですでに十分な比較ができている場合:

Task 108-0:

明細受け皿方針に基づき、内装作業マスタ設計へ進む。

ただし、schema実装はまだ行わない。

## 未解決事項

- 通常Repairの正式明細を `EstimateItem` 拡張で始めるか、`RepairLineItem` 新設で始めるか。
- 請求書発行時点スナップショット、または `InvoiceLineItem` 相当をどう設計するか。
- B2C共有ページで価格を表示するか、B2C PublicCaseと同じく非表示寄りにするか。
- 作業マスタの具体モデル名をどうするか。
- 外装作業マスタを内装と共通モデルにするか、別モデルにするか。

## 変更しなかったもの

- prisma/schema.prisma の変更なし
- migration作成なし
- db pushなし
- seed実装なし
- API変更なし
- UI変更なし
- RepairEntryForm変更なし
- PricingRule変更なし
- PublicCase生成ロジック変更なし
- 帳票/PDF/LINE送信処理変更なし
- テスト修正なし
- git addなし
- commitなし
- pushなし
