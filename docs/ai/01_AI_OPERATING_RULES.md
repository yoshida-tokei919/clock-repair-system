# AI OPERATING RULES

このファイルは、時計修理業務アプリ開発に関与する設計・レビュー担当AIの運用ルールを定義する入口文書である。

## 開始手順

時計修理業務アプリについて、現状整理、設計判断、Task作成、実装結果レビュー、次Task判断を行う前に必ず以下を読む。

1. `docs/ai/02_PRODUCT_ROADMAP.md`
2. `docs/ai/03_CURRENT_TASK.md`
3. `docs/ai/04_IMPLEMENTATION_RULES.md`

過去の会話記憶だけで現在の設計、現在地、Task方針を判断してはならない。

現在の会話でユーザーが明示的に新しい業務判断または方針変更を行った場合は、その最新指示を優先する。

## 02_PRODUCT_ROADMAP.md

アプリ全体の現在の設計方針、開発フェーズ、現在地、今後の大きな作業順序を管理する正本文書である。

過去の設計変更履歴は残さない。
現在有効な方針だけを書く。

## 03_CURRENT_TASK.md

現在進行中のTaskの状態を管理する正本文書である。

以下を簡潔に保持する。

- 現在Task
- 目的
- 現在地
- 確定事項
- 現在の問題
- 対象範囲
- 対象外
- 次の判断または作業

Task完了後は次Taskの内容へ更新する。
過去Task履歴は残さない。

## 04_IMPLEMENTATION_RULES.md

Codex等の実装担当AIが常時守る共通ルールを管理する。

設計・レビュー担当AIは実装担当AIへの指示で、このファイルと `docs/ai/03_CURRENT_TASK.md` を最初に読むよう明示する。

実装担当AIは、Taskで明示的に許可されない限り `docs/ai/01_AI_OPERATING_RULES.md`、`docs/ai/02_PRODUCT_ROADMAP.md`、`docs/ai/03_CURRENT_TASK.md`、`docs/ai/04_IMPLEMENTATION_RULES.md` を変更しない。

## 正本と実装の整合性

設計・レビュー担当AIはTask完了レビュー後に以下を確認する。

1. 実装結果と `docs/ai/03_CURRENT_TASK.md` が一致しているか
2. Task中に全体方針が確定または変更されたか
3. 全体方針に影響する場合は `docs/ai/02_PRODUCT_ROADMAP.md` を現在の正しい内容へ更新する
4. `docs/ai/02_PRODUCT_ROADMAP.md` と `docs/ai/03_CURRENT_TASK.md` に矛盾がないか
5. 再発防止の共通ルールが必要な場合は `docs/ai/04_IMPLEMENTATION_RULES.md` を更新する

更新時は変更履歴を原則残さない。
「以前はAだったがBへ変更した」のような経緯説明は書かず、現在有効なBだけを書く。

## Task docs

`docs/ai-tasks/` は個別Taskの調査・実装記録である。

Task docsは履歴資料であり、現在の設計判断の正本ではない。
現在状態を把握するために過去Task docsを順番に読み直してはならない。
過去の実装理由や経緯が必要な場合のみ参照する。

## 設計判断

正本文書、schema（DB定義）、seed（初期データ）、現行実装から判断できない事項を推測で決めてはならない。

特に以下は推測禁止とする。

- RepairWorkAction（処置マスタ）
- RepairWorkCategory（作業カテゴリ）
- PartNameMaster（標準部品名マスタ）
- PartsMaster（実部品・在庫マスタ）
- 内装/外装分類
- PricingRule（価格ルール）条件
- 業務フロー

判断できない場合はユーザーへ確認する。

## 実装担当AIへの指示

設計・レビュー担当AIは、Codex等へのTask指示に必ず以下を含める。

- `docs/ai/04_IMPLEMENTATION_RULES.md` を最初に読むこと
- `docs/ai/03_CURRENT_TASK.md` を読むこと
- 現在Task対象外を変更しないこと
- 正本と現行実装に差分を発見した場合、Task対象外なら勝手に修正せず報告すること

必要な場合のみ `docs/ai/02_PRODUCT_ROADMAP.md` も参照させる。
