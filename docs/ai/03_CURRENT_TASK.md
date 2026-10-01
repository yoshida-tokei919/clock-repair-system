# CURRENT TASK

## 現在のcheckpoint — 2026-10-01

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照する。

## Production

- Production application commit: `ca68d75cd52811a24ba830b692464e12af8b64cf`
- Commit subject: `feat: add physical tag lifecycle`
- Deploy source: GitHub `main` → Railway, exact feature commit `ca68d75cd52811a24ba830b692464e12af8b64cf`
- Railway deployment: `5a973ee0-f8d5-44d2-bcae-b4a23a0b2ce9`
- Deployment status: `SUCCESS`
- Production tag: `production-task196c-20261001`
- Region: `sin`
- Task196C migration: none

Production: Task196C complete

## Task196C production確認

- Stage BのPhysicalTag assign / release / replace lifecycleをproductionへ反映。Railway runtimeはNext.js Ready in 264ms。
- `POST /api/physical-tags/assign`、`POST /api/physical-tags/release`、`POST /api/physical-tags/replace` を追加。
- 既存NextAuthを維持し、session emailから`Admin.id`を解決して`assignedBy` / `releasedBy`へ保存。hard-coded Admin IDは使用しない。
- assignはACTIVEかつ未割当tag、active tagを持たないRepairのみ許可。
- releaseはactive assignmentを履歴として残し、通常releaseではPhysicalTagをACTIVEのまま再利用可能にする。
- replaceはSerializable transaction内で旧assignment release → 旧tag RETIRED → 新tag assignを実行し、途中失敗時は全体rollback。
- DB partial unique indexを最終防衛線として維持し、`P2002` / `P2034`等の競合は409へ分類。
- Codex実装 → Katari独立レビュー。blocking issueなし。
- focused tests 8/8、TypeScript型チェック、staged `git diff --cached --check` はPASS。
- schema / migration / seed / env / RLS / GRANT / Repair status / Shipment / LINE / UI変更なし。
- Production smoke: `/` = 200、`/login` = 200、未認証assign / release / replaceはvalid JSON・malformed JSONとも401。
- malformed JSONでも401となるため、productionでも認証がrequest body parseより先に実行されていることを確認。
- 詳細: `docs/ai-tasks/196c-physical-tag-lifecycle.md`

## Scheduler / Feedback の現在地

Stage AのTask182–184とTask188–195Eはproduction完了。Task185–187はdocs-only完了。Task195Eの納期・安全buffer feedbackのdata readinessは `docs/ai-tasks/195e-deadline-feedback-readiness.md` を参照する。

## Stage B — 次の候補: Task196D

Status: awaiting user approval（未着手）

Task196DはQR付き小型ラベル表示・印刷の最小導線を対象とする。
PhysicalTagの発行・登録導線（shortCode / random qrToken / nfcUid等）をどこまでTask196Dへ含めるかは、実装前調査で現行schema・ラベルプリンタ運用・QR要件と再照合してTask境界を確定する。

R65 USB HID readerのreader固有UID format確認は引き続き実機PoC待ち。byte order、HEX/DEC、prefix/suffix、Enter、実際のUID出力形式は推測で固定しない。

Task196Dは未着手。ユーザー承認なしに実装開始しない。Task197 ScanSession / 連続読取も未着手。
