# CURRENT TASK

## 現在のcheckpoint — 2026-09-25

このファイルは、現在の実装Taskとproductionの現在地だけを管理する。
過去Taskの詳細は `docs/ai-tasks/` と各runbookを参照し、ここへ長い履歴を残さない。

## Production

- Production application commit: `76b90a3f6a75d41d4e37143d185e8904a31355b8`
- Commit subject: `feat: add schedule MVP foundation`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `ed85d5e8-a86d-456b-8681-08e7784aba3d`
- Deployment status: `SUCCESS`
- Production tag: `production-task182-20260925`
- Region: `sin`
- Supabase production migration: `20260925033435 add_repair_schedule_locked`
- Production backup:
  - `C:\Users\yoshi\clock-repair-backups\task182-20260925T033100Z`
  - `roles.sql`
  - `schema.sql`
  - `data.sql`
  - `manifest.txt`（SHA256記録）
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - `/orders` = 200
  - unauthenticated `PATCH /api/repairs/1/schedule` = 401
- Railway runtime log: startup errorなし
- Supabase Security Advisor:
  - Task182由来の新規警告なし
  - 既存functionの mutable search_path WARN 2件はTask外

Production: Task182 complete

## 直近完了Task

### Task182: Schedule MVP Step 1 基盤

- commit: `76b90a3f6a75d41d4e37143d185e8904a31355b8`
- Repairの既存項目を再利用:
  - `priorityScore`（優先度スコア）
  - `scheduledDate`（作業予定日）
  - `estimatedWorkMinutes`（想定作業時間）
  - `deliveryDateExpected`（納品予定日）
  - `deliveryDateActual`（実納品日）
- 新規追加:
  - `scheduleLocked Boolean @default(false)`（自動再配置ロック）
- Repair詳細に独立した作業スケジュールパネルを追加
- 専用API `PATCH /api/repairs/[id]/schedule` を追加
- `priorityScore` はStep 1ではread-only
- `src/lib/scheduling.ts` の旧仮ロジックは変更・有効化していない
- WorkCalendar / 自動スケジューラー / Shipment / 発注リードタイム等はTask外
- 詳細: `docs/ai-tasks/182-schedule-mvp-foundation.md`

Task182 local確認:
- schedule入力test: 2 / 2 PASS
- `npx prisma validate`: PASS
- `npx tsc --noEmit --incremental false`: PASS
- `git diff --check`: PASS
- Railway production build内 `prisma generate`: PASS
- Railway production Next.js build: PASS

## 現在Task

次の実装Taskは、`docs/ai/02_PRODUCT_ROADMAP.md` の
**MVP Step 2: WorkCalendar MVP**。

Task番号は **Task183** とする。

## Task183: WorkCalendar MVP

### 目的

Schedule MVP Step 3のシンプル自動スケジューラーが、
「その日に何分作業できるか」を参照できる最小カレンダー基盤を作る。

最優先目標:
- できるだけ早くスケジュール管理込みで実運用開始する
- 複雑な勤務管理・予約管理へ広げない
- 通常日の既定値を8時間/日として、例外だけ入力する運用を優先する

### MVP要件

ロードマップのStep 2を基準に以下を最低限サポートする。

- 標準作業可能時間: 8時間/日
- 通常日は既定値を利用
- 休み: 0h
- 半日: 4h
- 通常: 8h
- 任意時間
- メモ
- 月初に休み・半日・私用等の例外だけ登録できる
- Step 3から日別作業可能時間を安全に取得できる

### 実装前に調査するもの

1. 現行Prisma schema
2. 既存calendar / schedule / settings関連model・API・UI
3. 日付のtimezone運用
4. 管理画面のnavigation / page構成
5. server-side認証・API流儀
6. WorkCalendarを新規tableにする場合のRLS / Data API / GRANT要否

### Task境界

Task183ではWorkCalendar基盤と手動例外入力までに限定する。

対象外:
- 自動スケジューラー本体
- priorityScore計算ロジック
- Repairの自動配置
- ドラッグ配置
- 分刻みガント
- 作業実績計測
- Shipment
- 発注リードタイム
- LINE
- 帳票 / PDF / 共有ページ
- マスタデータ投入・復旧

schema / migration / RLS / GRANT変更が必要な場合は高リスク変更として扱い、
Codex実装後にカタリが独立レビューする。
production migration / deployはユーザーの明示承認なしに実行しない。

## Schedule MVPの順序

1. Step 1: Schedule MVP基盤 — **Task182 production完了**
2. Step 2: WorkCalendar MVP — **Task183 現在Task**
3. Step 3: シンプル自動スケジューラー
4. Step 1〜3完了時点でスケジュール込み実運用開始

## 並行作業・Task境界

- マスタデータ投入・復旧は別Taskとして並行してよい
- Schedule MVPとマスタ投入の差分・commitを混ぜない
- Brand / BrandAlias production importは完了済み
- foundation master 6種のproduction importは完了済み
- Task180 / Task181 / Task182はproduction反映済み
- 新しいschema / migration / RLS / GRANT変更は高リスク変更として独立レビューする

## 保留中

- Task172: Stripe production化
- LINE conversation後続Task（Repair summary / ongoing AI classification等）
- Shipment / ゆうプリR / LINE発送連携はSchedule MVP運用開始後のロードマップ順で進める
- QR / 事例公開等は当面Schedule MVPより後順位
- Railway buildで検出された既存依存関係のnpm audit / Next.js security warningは別Taskで扱う

## 次に行うこと

1. Task183開始時の `git status` を確認
2. WorkCalendar関連の既存schema / UI / API / timezone運用を調査
3. 最小schemaとTask境界を確定
4. Codex枠が利用可能ならCodexを実装担当にする
5. カタリが差分・migration・RLS / GRANTを独立レビュー
6. local自動確認
7. Task183を1 commitにする
8. production migration / deploy前にユーザー承認ポイントで停止

このdocs-maintenance自体はアプリ挙動・schema・production DBを変更しない。

Docs-maintenance Production: pending（docs-only。production applicationは引き続き `76b90a3`）。
