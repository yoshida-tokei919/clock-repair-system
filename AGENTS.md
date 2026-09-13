# AGENTS.md

Before investigating or modifying this repository, read:

1. `docs/ai/04_IMPLEMENTATION_RULES.md`
2. `docs/ai/03_CURRENT_TASK.md`

Follow the current Task boundary.
Do not modify files or behavior outside the current Task unless the user explicitly expands the scope.

## 動作確認の役割分担

- ユーザーから明示指示がある場合を除き、Codex/AIはPlaywrightやブラウザ自動操作による実画面確認を行わない。
- Codex/AIは、Taskに応じてTypeScript型チェック、lint、Node test、`git diff --check` などの静的・自動確認を担当する。
- 実画面・ブラウザ・スマホの確認はユーザーが手動で行う。Codex/AIは確認手順と期待結果を日本語で提示する。
- 実画面確認をしていない場合は「確認済み」と報告しない。
- Node testが `spawn EPERM` などの実行環境エラーで起動できない場合は、assertion failureと区別して報告し、同じ回避再実行を繰り返さない。

For repair work masters, parts masters, PricingRule, or INTERNAL/EXTERNAL classification:

- inspect the canonical docs, schema, seed, and current implementation before deciding
- never infer or invent RepairWorkAction definitions
- never infer or invent RepairWorkCategory definitions
- never mix INTERNAL and EXTERNAL actions
- never treat PartNameMaster and PartsMaster as the same master
- report out-of-scope discrepancies instead of silently fixing them

Do not modify `docs/ai/01_AI_OPERATING_RULES.md`, `docs/ai/02_PRODUCT_ROADMAP.md`, `docs/ai/03_CURRENT_TASK.md`, or `docs/ai/04_IMPLEMENTATION_RULES.md` unless the Task explicitly authorizes documentation maintenance.
