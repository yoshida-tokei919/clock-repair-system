# AI Task 107-6-reset: 作業マスタ・PublicCase正本整理

## 1. 今回のリセット理由

107-5で作成した大量seed候補案は、旧Excel由来候補や一般的な作業名を正式マスタ化する方向に寄りすぎていた。

最新版方針では、作業マスタをいきなり大量seed化しない。

先に、業務アプリ側の入力構造・明細構造を整え、PublicCaseはその構造化データを公開用にスナップショット化する。

そのため、内装作業マスタ、外装作業マスタ、PublicCaseの正本メモを作成し、以後の判断基準を整理した。

## 2. 正本ファイル一覧

- `docs/masters/internal-work-master-design-notes.md`
- `docs/masters/external-work-master-design-notes.md`
- `docs/masters/public-case-design-notes.md`

今後はこの3ファイルを正本として扱う。

## 3. 内装作業マスタ正本の要点

- 内装作業マスタは、新アプリ通常Repairの構造化入力を支える。
- 作業マスタは入力補助・標準化・候補選択の元データ。
- 帳票・共有ページ・PublicCaseへ直接表示しない。
- 表示名・価格・価格表示フラグはRepair明細へスナップショット保存する。
- PricingRuleは価格ルールとして残し、作業マスタ本体にしない。
- FMP過去案件のクリーニングルールを通常Repairへ持ち込まない。
- 旧Excel由来候補をそのまま正式マスタ化しない。

## 4. 外装作業マスタ正本の要点

- 外装作業マスタも、内装作業マスタと同じ思想で扱う。
- 外装部品マスタと外装作業マスタを混ぜない。
- 外装修理の詳細設計は後続タスクで扱う。
- ExternalWorkMasterをいきなりschema化しない。
- PublicCase表示のために業務入力構造を歪めない。

## 5. PublicCase正本の要点

- PublicCaseは公開事例用スナップショット。
- 部品マスタや作業マスタを直接表示しない。
- Repair明細 / EstimateItem / RepairLineItem に保存されたスナップショットを元に生成する。
- B2Cは価格非表示を基本とする。
- B2Bは `showPriceB2b = true` かつ正の価格のみ表示する。
- 0円、未紐づけPartItem価格、内部管理文言、コピー表記は表示しない。
- FMP専用処理と通常Repairの構造化入力を分ける。

## 6. 旧Excel由来候補の扱い

旧Excel由来の内外装作業候補は、正式な作業マスタ本体ではない。

理由:

- FMP過去案件の表記ゆれ・救済ルールが混ざっている。
- 事例掲載用の表示名と、業務入力用の作業マスタが混ざっている。
- 部品マスタと作業マスタの役割が混ざりやすい。
- 帳票・共有ページ・PublicCaseとの接続設計を先に決める必要がある。

旧Excel由来候補は参考資料として扱い、新アプリ通常Repair用の正式マスタとしてそのまま実装しない。

## 7. 107-5大量seed案の扱い

`docs/ai-tasks/107-5-design-internal-work-category-and-name-seed-candidates.md` は削除しない。

ただし、冒頭に注意書きを追加し、本線として採用しないことを明記した。

今後は、107-5ではなく以下を正本とする。

- `docs/masters/internal-work-master-design-notes.md`
- `docs/masters/external-work-master-design-notes.md`
- `docs/masters/public-case-design-notes.md`

## 8. 107-6レビュー表の扱い

`docs/ai-tasks/107-6-review-internal-work-seed-candidates.md` は削除した。

理由:

- 大量seed方式のレビュー表であり、最新版方針では不要。
- 作業マスタを旧Excel由来候補や一般的作業名からそのまま正式化しない方針へ戻すため。

## 9. 今後やってはいけないこと

- WorkCategoryMaster / WorkNameMaster をいきなりschema化する。
- InternalWorkMaster / ExternalWorkMaster をいきなりschema化する。
- PricingRuleを作業マスタ本体として使う。
- 部品マスタ全体の仕様を作業マスタファイルで定義する。
- 旧Excel由来の作業候補をそのまま正式マスタにする。
- FMP過去案件の救済ルールを新アプリ通常Repairへ持ち込む。
- PublicCaseをRepairやEstimateItemの直表示にする。
- 帳票・共有ページでマスタを直参照して表示する。
- 作業マスタ未確定のままドリルダウン検索を本実装する。
- Supabase本番DBへ未整理のまま投入する。

## 10. 次Task案

Task 107-7:

最新版正本に基づき、107-2〜107-4の成果物を再確認し、矛盾点があれば最小修正する。

Task 108:

明細受け皿方針が確定した後、内装作業マスタ設計へ進む。

ただし、schema実装はまだ行わない。

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
