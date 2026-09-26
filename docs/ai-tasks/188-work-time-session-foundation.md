# Task188: WorkTimeSession 基盤

## 範囲と状態

- WorkTimeSession の schema、migration、server API、入力検証、snapshot、状態遷移テストをローカル実装。
- UI、集計・推定、SchedulerSetting、作業標準、スケジューラ v2、Task189 以降は対象外。
- Production: pending。production migration / DB 操作 / deploy / push は未実施。

## データと安全性

- 活動区分は `REPAIR`、`ESTIMATE`、`INTAKE`、`INQUIRY`、`CUSTOMER_CONTACT`、`PARTS_ORDER`、`SHIPPING`、`ADMIN`、`OTHER`。
- Repair / Inquiry / OrderRequest は nullable FK（削除時 SetNull）。RepairLineItem ID は保存・参照せず、LABOR 行の作業条件を開始時の `contextSnapshot` version 1 に保存する。PART 行は拒否する。
- active は `endedAt IS NULL AND invalidatedAt IS NULL`。PostgreSQL partial unique index で全体 1 件を保証し、start / stop / correction / invalidate は独立した advisory lock を持つ transaction で直列化する。
- start は現在の active を閉じて新規作成する switch。stop は active がなければ `stopped: false`。active の無効化では先に終了時刻を入れる。
- 修正は終了済みの有効 session のみ。最初の修正時刻を `originalStartedAt` / `originalEndedAt` に保存し、再修正でも保持する。修正・無効化には理由を必須とする。
- 時刻は秒精度で扱う。手動修正 API では timezone 付き ISO 8601 を要求する。
- テーブルは RLS 有効。Data API 用の anon / authenticated / service_role には table / sequence の権限を与えない。

## API

- `GET /api/work-time-sessions/active`
- `POST /api/work-time-sessions/start`
- `POST /api/work-time-sessions/stop`
- `PATCH /api/work-time-sessions/[id]`
- `POST /api/work-time-sessions/[id]/invalidate`

すべて NextAuth セッション必須。`start` は `activityType` と任意の `repairId` / `inquiryId` / `orderRequestId` / `repairLineItemId` / `label` を受ける。REPAIR / ESTIMATE は `repairId` 必須。修正は `startedAt`、`endedAt`、`reason`、無効化は `reason` を受ける。

## 確認

- Prisma format を実行。既存 schema 全体の整形差分が大きかったため、新規定義のみを元の配置へ戻した。Prisma validate: PASS。
- Prisma generate: Windows の既存 query engine DLL 置換は EPERM。`PRISMA_GENERATE_NO_ENGINE=1` のローカル生成で型確認済み。
- TypeScript (`npx tsc --noEmit --incremental false`): PASS。
- 関連 Node tests: 12 / 12 PASS。`tsx --test` は実行環境の `spawn EPERM` で起動できなかったため、テストファイルをそれぞれ `tsx` で直接実行した。
- Next lint: ESLint 設定が存在せず対話プロンプトが出たため未確認。
- `git diff --check`: PASS。
- カタリ独立レビュー: PASS。初回指摘の `startedAt` 単独index不足と過剰な PUBLIC / enum REVOKE はCodexが修正し、再レビュー済み。
- カタリ独立再実行: Prisma validate PASS、関連テスト 12 / 12 PASS、TypeScript PASS、`npx next build` PASS（exit 0）。build中の既存 `/api/repairs/recent` Dynamic server usageログはTask188対象外。
- production migration / DB 照合は未実施。
