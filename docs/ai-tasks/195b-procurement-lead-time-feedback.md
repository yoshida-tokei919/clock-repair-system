# Task195B — Procurement total lead-time feedback

Status: production complete
Date: 2026-09-29

## 目的

既存の `OrderRequest.orderedAt` / `receivedAt` から観測可能な調達総リードタイムを可視化し、現在設定との比較材料を提供する。

Supplier処理日数とShippingMethod輸送日数は概念上分離したまま保持し、総実績から内訳を推測しない。

## 実装

### Day semantics

Task191の予定日計算と同じAsia/Tokyo暦日基準を使用するため、`order-expected-arrival.ts` の日付変換を `tokyoCalendarDate` として共通化した。

### Sample

対象:
- orderedAtあり
- receivedAtあり
- receivedAt >= orderedAt
- cancelledではない

除外:
- 未受領
- orderedAt欠落
- receivedAt欠落
- 不正interval
- cancelled

### Grouping

`supplierId + procurementShippingMethodId` の完全な組を集計キーにする。

片側がnullの場合はunknown dimensionとして独立した組を保持し、観測された総日数をSupplier単体・ShippingMethod単体の因果的推定値として扱わない。

### Statistics

raw descriptive statistics:
- sampleCount
- medianDays
- meanDays
- p80Days（nearest-rank）
- minDays
- maxDays

小標本でも値は表示し、件数を併記する。
自動採用・自動更新はしない。

### Current configured comparison

現在のSupplier設定 `manualProcessingLeadDays` と ShippingMethod設定 `manualTransitLeadDays` をTask191の成立条件で合算する。

両方設定済みの場合だけ `configuredTotalDays` を算出し、median / mean / P80との差を表示する。
これは現在設定との比較であり、各OrderRequest発注時点の過去設定を復元したものではない。

### UI

Scheduler設定画面の既存Procurement設定sectionにread-only表を追加。

表示:
- 仕入先
- 配送方法
- 件数
- 現在設定合計
- 中央値
- 平均
- P80
- 最小〜最大
- 設定比delta

UI上で「観測できるのは総リードタイムのみで、仕入先処理と輸送へ分解できない」ことを明示する。

### API

`GET /api/settings/procurement/feedback`

- session auth必須
- read-only
- OrderRequest / Supplier / ProcurementShippingMethodをbulk read
- DB writeなし
- feedback取得失敗は既存procurement設定画面の編集を阻害しない

## Validation

- Task195B + Task191周辺回帰: 27 / 27 PASS。
- TypeScript: PASS。
- diff-check: PASS。
- auth / read-only boundary: PASS。
- feedback failure isolation: PASS。
- schema / migration / seed / RLS / GRANT変更なし。

## Production

- Application commit: `e8f5eb97d4955d8d01547c250f1ebd010e860ff6`
- Commit subject: `feat: add procurement lead-time feedback`
- Railway deployment: `24cc4192-7999-4497-9da1-1166b0f5e833`
- Status: SUCCESS
- Production tag: `production-task195b-20260929`
- Migration: none
- Smoke:
  - root 200
  - login 200
  - unauthenticated scheduler settings 307
  - unauthenticated procurement feedback API 401

## 次Task

Task195C: 非REPAIR共通業務のWorkTimeSession実績と現在のSchedulerActivitySetting予約枠を比較するread-only feedback。
