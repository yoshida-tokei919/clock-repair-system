# Task183: WorkCalendar MVP

## 対象と境界

Schedule MVP Step 2。日別の作業可能時間をStep 3から参照できるようにし、月初に休み・半日・私用などの例外を手入力できるようにする。標準日は480分（8時間）で、DB rowを作らない。自動スケジューラー、Repairの配置・優先度計算、Shipment、LINE、マスタデータには触れない。

## SchemaとData API

- `WorkCalendar` は `workDate DATE` を主キーに、`availableMinutes`、nullable `note`、作成・更新日時を保持する。例外だけ保存し、日付の重複やsequenceはない。
- migrationは `public."WorkCalendar"` を作成し、`availableMinutes` に0〜1440のCHECK制約を設ける。
- この表はPrisma direct DB connectionからだけ使用するserver-only表。Data APIからのアクセスは不要なので、同じmigration内でRLSを有効化し、`anon`、`authenticated`、`service_role` から全table権限をREVOKEする。policyやGRANTは作らない。
- schema / migration / RLS / REVOKEはカタリ独立レビュー済み。production migration `20260925072252 add_work_calendar` を適用済み。
- production確認でRLS有効、0〜1440分CHECK制約あり、`anon` / `authenticated` / `service_role` のtable privilegeなしを再確認した。

## API・日付処理

- `GET /api/work-calendar?month=YYYY-MM`: 認証必須。月を検証し、その月の例外だけを日付昇順で返す。応答には `defaultAvailableMinutes: 480` を含める。
- `PUT /api/work-calendar`: 認証必須。`date`、`availableMinutes`、`note` のみ受け付ける。実在する日付、0〜1440の整数、trim後200文字以内のメモを検証する。480分かつメモなしなら `deleteMany` で例外を削除し、それ以外は日付主キーでupsertする。他表への副作用はない。
- APIの日付は `YYYY-MM-DD`、DBはPostgreSQL `DATE`。pure helperがUTC midnightへの変換とUTCでのserializeを行い、timezoneによる日付のずれを避ける。保存行がない日は `availableMinutesForDate` が480分を返す。

## UI

- `/repairs/calendar` に月単位の7列カレンダー、前月・次月、各日の実効時間、日別編集欄を追加した。既存middlewareの `/repairs/:path*` により認証保護される。
- 休み0h、半日4h、通常8hのpreset、0〜24hの任意時間、メモを入力できる。保存結果はその場で月表示へ反映する。「通常8hに戻す（メモ削除）」を選んで保存すると例外が削除される。
- Sidebarに「作業カレンダー」を追加した。

## 確認

- `npx tsx --test src/lib/work-calendar.test.ts`: 5 / 5 PASS。日付・月の妥当性、0/240/480/1440分、負数・超過・非整数、メモ正規化、標準日へのリセット、UTC serializeを確認。
- `npx prisma validate`: PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- カタリ独立レビュー: schema / migration / RLS / REVOKE / API副作用 / Task境界を確認し、機能上の指摘なし。
- local `npx prisma generate`: 既存Windows DLL `query_engine-windows.dll.node` のunlinkで `EPERM`。Railway production buildではPrisma Client生成PASS。
- local `npx next build`: build worker起動時に環境の `spawn EPERM`。Railway production buildではNext.js compile / type check / page generationまでPASS。
- `npm run lint`: local ESLint未設定の対話式設定画面が開いたため単独lintは未実施。Railway build内のlint/type check工程は通過。
- production non-destructive smoke: `/`=200、`/login`=200、未認証 `/repairs/calendar`=307（NextAuth redirect）、未認証 `GET /api/work-calendar?month=2026-09`=401。
- Railway runtime: `next start` → `Ready in 511ms`。起動失敗なし。

## Production

Production: complete。

- application commit: `d0f7f66ab11da7d2e4edb7d1db72deca854e866b`
- Railway deployment: `7557aac8-c75f-4104-8bbe-294b963a4a53` / `SUCCESS` / region `sin`
- production tag: `production-task183-20260925`
- Supabase migration: `20260925072252 add_work_calendar`
- backup: `C:\\Users\\yoshi\\clock-repair-backups\\task183-20260925T072110Z`（`roles.sql` / `schema.sql` / `data.sql` / SHA256付き `manifest.txt`）
- Security Advisor: `WorkCalendar` の `rls_enabled_no_policy` INFO 1件は、Data API roleへの権限を明示REVOKEしたserver-only設計のため意図どおり。既存 `function_search_path_mutable` WARN 2件はTask外。
- production `WorkCalendar` exception rowは反映直後0件。
