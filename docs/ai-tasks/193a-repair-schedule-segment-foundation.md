# Task193A: RepairScheduleSegment schema foundation

Production: complete。Application commit `33384b00a151573c815234841f4b1faef0b9c589` を GitHub `main` から Railway へ自動deploy済み。

## 意味と範囲

`RepairScheduleSegment` は、将来の複数日スケジュールに使う日別予定明細の最小基盤。1つの `Repair` と1つの `workDate` の組に、1件の日別集約 segment だけを保存する。`plannedMinutes` はその日の正の予定分数、`sortOrder` は日別一覧の非負の表示順を表す。

`source=AUTO` は自動配置由来、`source=MANUAL` は手動配置由来を表す。Task193Aでは生成・更新操作を実装しない。

既存の `Repair.scheduledDate` は互換用の代表日・summary として維持し、このTaskでは値も意味も変更しない。既存予定からsegmentへのbackfillやseed追加もしない。segmentを予定の正本として使う規則とsummaryとの同期はTask193B以降で扱う。

## アクセス制御

このtableはserver-only。RLSを有効化し、`anon`、`authenticated`、`service_role` のtable権限とID sequence権限を `REVOKE ALL` する。Data API用の `GRANT` やpolicyは追加しない。

## ローカル確認 / 独立レビュー

- Task193A schema test: 4 / 4 PASS。
- Task191A regression: 4 / 4 PASS。
- Task192A regression: 1 / 1 PASS。
- `npx prisma validate`: PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- Codex実装 → カタリ独立レビュー: 指摘なし / PASS。
- `node --test` はWindows実行環境の `spawn EPERM` で起動できなかったため、同じ回避を繰り返さず各テストファイルをNodeで直接実行してassertion PASSを確認。

## Production backup

- 保存先: `C:\Users\yoshi\clock-repair-backups\task193a-20260928-060438`
- Supabase Free planでmanaged daily backupは利用できず、ローカルSupabase CLIも未認証・未linkだったため、production DBへread-only SQLで現在データ + XSDとschema metadataを取得したfallback backup。
- `public-data-and-xsd.xml`: 379,066 bytes
  - SHA256 `6A9AC4E767629F6836442096A92C25CB18AFAD84AE127B7DB56615738F368727`
- `schema-metadata.json`: 297,229 bytes
  - SHA256 `F5AE90CBE0D95F88C8FA8B0926044A5E6EEA7D77BD27EB8EEBF64D34E60265FF`
- snapshot取得時のpublic base table: 69。
- これはpg_dump archiveではなく、read-only SQLによるlogical XML + metadata snapshot。直前のfull SQL dump baselineは `C:\Users\yoshi\clock-repair-backups\task192a-20260928-013752` に残っている。
- Task193A migrationは新enum + 空tableのみのadditive DDLで、既存行のbackfill/updateは行わない。

## Production migration / DB verification

- Supabase migration: `20260927211044 add_repair_schedule_segment`
- `RepairScheduleSegment`: 0行。
- `RepairScheduleSegmentSource`: `AUTO`, `MANUAL`。
- CHECK:
  - `plannedMinutes > 0`
  - `sortOrder >= 0`
- FK: `repairId -> Repair.id`, `ON DELETE CASCADE`, `ON UPDATE CASCADE`。
- unique: `(repairId, workDate)`。
- index: `(workDate, sortOrder)`。
- RLS enabled、policy 0件。
- `anon` / `authenticated` / `service_role` はtable SELECT権限なし。
- 同3 roleは `RepairScheduleSegment_id_seq` のUSAGE権限なし。
- Security Advisor:
  - 新tableの `rls_enabled_no_policy` INFOはserver-only設計として意図どおり。
  - 既存2関数の `function_search_path_mutable` WARNはTask193A対象外。

## Production application

- Production application commit: `33384b00a151573c815234841f4b1faef0b9c589`
- Commit subject: `feat: add repair schedule segment foundation`
- Production tag: `production-task193a-20260928`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `0dc0a7c4-ac17-4792-b2f5-a606e3c59054`
- Deployment status: `SUCCESS`
- Region: `sin`
- Railway runtime: `next start` / `Ready in 373ms`
- Build: Prisma Client v5.7.0生成、Next.js compile / type check / static generation完了。
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - 未認証 `/repairs/calendar` = 307 → `/api/auth/signin?callbackUrl=%2Frepairs%2Fcalendar`
  - 未認証 `GET /api/repairs/deadline-capacity-preview` = 401

## 対象外 / 次段階

Task193B以降のplanner、複数日への配置、preview → 人間確認 → apply、`scheduledDate` との同期・正本切替、自動再計算は対象外。Task184自動スケジューラー、Task192B read-only preview、`scheduleLocked`、作業時間・残作業時間、優先度、WorkCalendar、Repair.status、画面/API、SchedulerSettingも変更していない。

Task193A production反映完了。Task193Bは未着手。
