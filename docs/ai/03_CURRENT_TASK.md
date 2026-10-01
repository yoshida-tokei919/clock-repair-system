# CURRENT TASK

## 現在のcheckpoint — 2026-10-01

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照する。

## Production

- Production application commit: `33cae4f5a380dada62250e936735cef2e291080a`
- Commit subject: `feat: add physical tag resolver`
- Deploy source: GitHub `main` → Railway, exact feature commit `33cae4f5a380dada62250e936735cef2e291080a`
- Railway deployment: `9079ed6f-d1e4-4339-bdcb-1d163f7975a3`
- Deployment status: `SUCCESS`
- Production tag: `production-task196b-20261001`
- Region: `sin`
- Task196B migration: none

Production: Task196B complete

## Task196B production確認

- Stage Bの認証必須PhysicalTag共通resolverをproductionへ反映。Railway runtimeはNext.js Ready in 388ms。
- `POST /api/physical-tags/resolve` で `NFC_UID` / `QR_TOKEN` / `SHORT_CODE` を同じPhysicalTagへ解決し、`NOT_FOUND` / `RETIRED` / `UNASSIGNED` / `RESOLVED` を返す。
- 未認証ではrequest bodyを読む前に401を返し、PhysicalTag / Repair lookupを実行しない。
- `RESOLVED` は `physicalTagId` / `shortCode` / `assignmentId` / `assignedAt` / `repairId` / `inquiryNumber` / `customerId` / `repairStatus` のみに限定し、顧客名・電話番号・住所等のPIIはselectしない。
- iPhone + NFC ToolsでNTAG215のUID `04:33:3F:45:3B:02:89` とNDEF URL書込・通常iPhone読取を確認済み。Task196Bでは `04333F453B0289` への保守的なHEX正規化のみ実装。
- R65実機PoCは未完了。byte order反転、decimal→hex変換、reader固有prefix/suffix、固定UID長、R65出力formatは未確定のまま。
- Katari実装 → Codex独立レビュー。初回blocking 1件を修正後、再レビューでblocking issueなし。
- focused tests 7/7、TypeScript型チェック、`git diff --check` はPASS。
- schema / migration / seed / env / RLS / GRANT / production DB書込なし。
- Production smoke: `/` = 200、`/login` = 200、未認証resolver valid JSON = 401、未認証resolver malformed JSON = 401。
- 詳細: `docs/ai-tasks/196b-physical-tag-resolver.md`

## Scheduler / Feedback の現在地

Stage AのTask182–184とTask188–195Eはproduction完了。Task185–187はdocs-only完了。Task195Eの納期・安全buffer feedbackのdata readinessは `docs/ai-tasks/195e-deadline-feedback-readiness.md` を参照する。

## Stage B — 次の候補: Task196C

Status: awaiting user approval（未着手）

Task196Cは、Task196AのPhysicalTag / PhysicalTagAssignment基盤とTask196Bの共通resolverを前提に、PhysicalTagのassign / release / replace lifecycleを対象とする。

R65 USB HID readerのreader固有UID format確認は引き続き実機PoC待ち。Task196Bの共通resolver production反映完了と、R65固有format確定は分けて扱う。

着手時はimplementation-prep / current-state confirmationから始め、`docs/ai-tasks/196-physical-tag-nfc-design.md`、現行schema・実装、reader PoCの状況を再確認し、Task境界に従う。Task196DおよびTask197は未着手。
