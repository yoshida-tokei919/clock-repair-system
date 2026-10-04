# タイマー・Scheduler編 印刷見本構成

対象章:

- 第13章 WorkTimeSessionと共通業務タイマー
- 第14章 Scheduler設定・標準作業時間・実績学習
- 第15章 WorkCalendar・Scheduler v2・今日の作業

A4カラーでのページ構成確認用。最終PDFでは本文量に応じて見開き・図解を調整する。

---

## 1ページ目 — 共通業務タイマー

![Work timer bar](../assets/screenshots/work-timer-bar.png)

### 要点

- active sessionはアプリ全体で最大1件
- 別作業開始は現在sessionを終了してswitch
- 受付 / 顧客連絡 / 発送 / 事務 / その他は上部バーから開始
- 秒精度で保存し、集計時に分単位へ扱う

---

## 2ページ目 — Repair作業タイマー

![Repair work timer](../assets/screenshots/repair-work-timer.png)

### 要点

- 見積開始 = ESTIMATE + repairId
- 技術料明細の修理開始 = REPAIR + repairId + 作業snapshot
- PART明細は修理タイマー対象外
- ページ移動だけでは停止しない

---

## 3ページ目 — Scheduler設定

![Scheduler settings](../assets/screenshots/scheduler-settings.png)

### 要点

- 学習mode / sample閾値 / 集計方法 / 工程bufferを設定
- 内装 / 外装の標準時間を分離
- 設定保存だけで既存予定・推定時間を自動変更しない

---

## 4ページ目 — Repair作業時間preview

![Repair work time preview](../assets/screenshots/repair-work-time-preview.png)

### 要点

- 現在保存値とresolverによるpreviewを比較
- COMPLETEの場合だけ「推定時間を採用」可能
- 推奨時間は人が採用するまでSchedulerへ自動反映しない

---

## 5ページ目 — WorkCalendar

![Work calendar](../assets/screenshots/work-calendar.png)

### 要点

- 通常480分
- 休み / 半日 / 私用等の例外だけ登録
- 現実の作業可能時間をSchedulerのgross capacityへ渡す

---

## 6ページ目 — Scheduler v2

![Scheduler v2 preview](../assets/screenshots/scheduler-v2-preview.png)

### 要点

```text
WorkCalendar
 + 予約時間
 + status / priority / 納期
 + 保存済み作業時間
 + 部品準備 / 中断
 + 既存segment
   ↓
分割予定案
   ↓ 人が確認
apply
```

- `作業待ち` を基本AUTO候補とする
- 部品入荷見込み日が分かるWAITINGは、その日以降へ配置可能
- 部品状態・見込み日不明や中断中はfail-closed
- manual segment / scheduleLockedを保護
- stale revisionは409で拒否し、自動再applyしない

---

## 7ページ目 — 今日の作業

![Today work](../assets/screenshots/today-work.png)

### 要点

- 総容量 / 実効容量 / 予定負荷 / 残容量
- 実行可能 / 再開候補 / 中断 / 部品待ち / その他を分離
- `ready` だけ直接Repairタイマーを開始可能
- 予定はRepairScheduleSegment、実績はWorkTimeSessionとして分離
