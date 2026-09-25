# AGENTS.md

Before investigating or modifying this repository, read:

1. `docs/ai/04_IMPLEMENTATION_RULES.md`
2. `docs/ai/03_CURRENT_TASK.md`
3. `docs/ai/02_PRODUCT_ROADMAP.md`

When handling LINE inquiries, Slack inquiry notifications, or AI intake processing, also read `docs/ai/05_INQUIRY_AI_RUNBOOK.md` after the documents above.

Follow the current Task boundary.
Do not modify files or behavior outside the current Task unless the user explicitly expands the scope.

## 動作確認の役割分担

- ユーザーの手動実画面確認は原則としてTask完了条件にしない。
- Codex/AIは、Taskに応じてTypeScript型チェック、lint、Node test、`git diff --check`、必要ならPlaywright等のブラウザ自動確認を担当する。
- UI変更では、可能な範囲でCodex/AI側の自動確認を優先し、ユーザーへ毎回の画面チェックを要求しない。
- プリンタ、スマホ実機、外部サービス本人操作、実顧客送信などAIだけで安全に確認できない項目、またはユーザーが明示的に希望した場合のみ手動確認を依頼する。
- 自動確認できなかった項目は「未確認」と明示し、確認したと偽らない。
- Node testが `spawn EPERM` などの実行環境エラーで起動できない場合は、assertion failureと区別して報告し、同じ回避再実行を繰り返さない。

For repair work masters, parts masters, PricingRule, or INTERNAL/EXTERNAL classification:

- inspect the canonical docs, schema, seed, and current implementation before deciding
- never infer or invent RepairWorkAction definitions
- never infer or invent RepairWorkCategory definitions
- never mix INTERNAL and EXTERNAL actions
- never treat PartNameMaster and PartsMaster as the same master
- report out-of-scope discrepancies instead of silently fixing them

Do not modify `docs/ai/01_AI_OPERATING_RULES.md`, `docs/ai/02_PRODUCT_ROADMAP.md`, `docs/ai/03_CURRENT_TASK.md`, or `docs/ai/04_IMPLEMENTATION_RULES.md` unless the Task explicitly authorizes documentation maintenance.
