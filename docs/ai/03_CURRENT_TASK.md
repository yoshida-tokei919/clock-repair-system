# CURRENT TASK

## 現在のcheckpoint — 2026-09-30

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照する。

## Production

- Production application commit: `90e5807d46861937e2896b084a725fd45d89ed49`
- Commit subject: `feat: add physical tag schema foundation`
- Deploy source: GitHub `main` → Railway, exact feature commit `90e5807d46861937e2896b084a725fd45d89ed49`
- Railway deployment: `e686c011-c30f-4ef3-a3bd-51d498eff33d`
- Deployment status: `SUCCESS`
- Production tag: `production-task196a-20260930`
- Region: `sin`
- Supabase migration: `20260929204922 add_physical_tag_foundation` — applied successfully

Production: Task196A complete

## Task196A production確認

- Stage BのPhysicalTag schema foundationをproductionへ反映。Railway runtimeはNext.js Ready in 260ms。
- Migration前の `public` base tableは70。read-only SQL fallback logical XML + schema metadataのbackupを取得（`pg_dump` ではない）。
- `PhysicalTag` / `PhysicalTagAssignment` は存在し、migration直後は両方とも空。unique制約、active割当のpartial unique index、CHECK、FK、RLSを確認。
- 両tableにRLSを有効化し、policyなし。Data API GRANTなし。Security Advisorの `rls_enabled_no_policy` INFOはserver-only設計どおりで、blocking issueなし。
- Codex実装 → カタリ独立レビュー。blocking issueなし。prisma validate、TypeScript型チェック、migration static safety checks、`git diff --check` はPASS。
- Production smoke: `/` = 200、`/login` = 200、未認証 `/api/work-time-sessions/active` = 401、未認証 `/api/work-calendar?month=2026-09` = 401。
- backfill、既存行更新、seedなし。intake / WorkTimeSession挙動、resolve・assign/release API、NFC/QR scan、UI・印刷は未変更。
- 詳細: `docs/ai-tasks/196a-physical-tag-schema-foundation.md`

## Scheduler / Feedback の現在地

Stage AのTask182–184とTask188–195Eはproduction完了。Task185–187はdocs-only完了。Task195Eの納期・安全buffer feedbackのdata readinessは `docs/ai-tasks/195e-deadline-feedback-readiness.md` を参照する。

## Stage B — 次の候補: Task196B

Status: awaiting user approval（未着手）

Task196Bは、QR token / shortCodeとNFC UID pathの認証必須の共通resolver contractを対象とする。NFC UID normalizationは実機reader PoCの結果に依存し、PoCは未完了。完了済みと扱わない。

着手時はimplementation-prep / current-state confirmationから始め、`docs/ai-tasks/196-physical-tag-nfc-design.md`、現行schema・実装、reader PoCの状況を再確認し、Task境界に従う。Task196C/DおよびTask197は未着手。
