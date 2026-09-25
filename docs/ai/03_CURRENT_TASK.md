# CURRENT TASK

## 現在のcheckpoint — 2026-09-25

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `d0f7f66ab11da7d2e4edb7d1db72deca854e866b`
- Commit subject: `feat: add WorkCalendar MVP`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `7557aac8-c75f-4104-8bbe-294b963a4a53`
- Deployment status: `SUCCESS`
- Production tag: `production-task183-20260925`
- Region: `sin`
- Supabase production migration: `20260925072252 add_work_calendar`
- Production backup:
  - `C:\Users\yoshi\clock-repair-backups\task183-20260925T072110Z`
  - `roles.sql`
  - `schema.sql`
  - `data.sql`
  - `manifest.txt`（SHA256記録）

Production: Task183 complete

## Task183 production確認

- `WorkCalendar` table作成済み
- RLS: enabled
- `availableMinutes`: DB CHECK 0〜1440分
- Data API:
  - `anon`: table privilegeなし
  - `authenticated`: table privilegeなし
  - `service_role`: table privilegeなし
- 反映直後の例外row: 0件
- Railway production build:
  - Prisma Client generate: PASS
  - Next.js compile: PASS
  - lint/type check工程: PASS
  - static page generation: 60 / 60
- Railway runtime:
  - `next start` 正常起動
  - `Ready in 511ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `/repairs/calendar` = 307 → NextAuth
  - unauthenticated `GET /api/work-calendar?month=2026-09` = 401

## Security Advisor

- `WorkCalendar`: `rls_enabled_no_policy` INFO 1件
  - server-only tableとしてData API roleへの権限を明示REVOKEしているため意図した状態
  - policy / Data API GRANTは不要
- 既存 `function_search_path_mutable` WARN 2件はTask外
  - `set_invoice_gross_total_on_insert`
  - `preventInquiryMessageClassificationManualOverwrite`
- Railway buildで出る既存npm audit / Next.js security warningはTask183外。別Taskで扱う

## 直近完了Task

### Task183: WorkCalendar MVP

- commit: `d0f7f66ab11da7d2e4edb7d1db72deca854e866b`
- 詳細: `docs/ai-tasks/183-work-calendar-mvp.md`
- 標準作業可能時間: 480分（8時間）/日
- 通常日はDB rowを持たず既定480分
- 例外のみ `WorkCalendar` に保存
- 休み0h / 半日4h / 通常8h / 任意時間 / メモ
- `/repairs/calendar` で月単位の例外入力
- 専用API `GET /api/work-calendar` / `PUT /api/work-calendar`
- 自動スケジューラー本体はTask外

## Schedule MVPの現在地

1. Step 1: Schedule MVP基盤 — **Task182 production完了**
2. Step 2: WorkCalendar MVP — **Task183 production完了**
3. Step 3: シンプル自動スケジューラー — **次Task候補**
4. Step 1〜3完了時点でスケジュール込み実運用開始

## 次の実装Task候補

Task番号は **Task184** とする。

### Task184: シンプル自動スケジューラー MVP

目的:
- Repairを日単位の作業予定へ自動配置する最小スケジューラーを作る
- WorkCalendarの日別作業可能時間を利用する
- 人間が最終判断できる設計を維持する

実装開始前に必ず調査:
1. `src/lib/scheduling.ts` の旧仮ロジック
2. 現行の作業可能状態・停止理由に使える既存データ
3. `priorityScore` の現行用途と値
4. `deliveryDateExpected` / `estimatedWorkMinutes` / `scheduleLocked`
5. WorkCalendarの取得方法と日別空き時間計算

Task184で勝手に確定しないもの:
- priorityScore計算式
- 作業可能条件
- 停止理由
- 部品待ち判定
- B2B/B2C優先条件

既存schema・実装・正本文書から安全に決められない業務ルールは、実装前に調査結果として明示する。

Task184対象外:
- 発注リードタイム連携
- Shipment
- ゆうプリR
- LINE
- 帳票 / PDF / 共有ページ
- マスタデータ投入・復旧
- 分刻みガント
- ドラッグ配置
- AI最適化
- npm audit / Next.js依存更新

## 並行作業・Task境界

- マスタデータ投入・復旧は別Taskとして並行してよい
- Schedule MVPとマスタ投入の差分・commitを混ぜない
- schema / migration / RLS / GRANT変更は高リスク変更として独立レビューする
- 一つのTask終了後、ユーザー承認なしに次Taskを実装開始しない

## 次に行うこと

1. このproduction記録docsをdocs-only commitにする
2. docs-only commit単独では不要なRailway redeployを避けるためpushしない
3. ユーザー承認後、Task184の調査から開始する

Docs-maintenance Production: pending（docs-only。production applicationは `d0f7f66`）。
