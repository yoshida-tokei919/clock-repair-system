# AGENTS.md

Before investigating or modifying this repository, read:

1. `docs/ai/04_IMPLEMENTATION_RULES.md`
2. `docs/ai/03_CURRENT_TASK.md`

Follow the current Task boundary.
Do not modify files or behavior outside the current Task unless the user explicitly expands the scope.

For repair work masters, parts masters, PricingRule, or INTERNAL/EXTERNAL classification:

- inspect the canonical docs, schema, seed, and current implementation before deciding
- never infer or invent RepairWorkAction definitions
- never infer or invent RepairWorkCategory definitions
- never mix INTERNAL and EXTERNAL actions
- never treat PartNameMaster and PartsMaster as the same master
- report out-of-scope discrepancies instead of silently fixing them

Do not modify `docs/ai/01_AI_OPERATING_RULES.md`, `docs/ai/02_PRODUCT_ROADMAP.md`, `docs/ai/03_CURRENT_TASK.md`, or `docs/ai/04_IMPLEMENTATION_RULES.md` unless the Task explicitly authorizes documentation maintenance.
