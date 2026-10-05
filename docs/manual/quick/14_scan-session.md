# 簡易版 14 — PhysicalTagをscanする

## 目的

時計現物のPhysicalTagから正しいRepairを特定し、作業タイマーを安全に開始する。

## 1. 読取モードを選ぶ

画面上部のScanSessionで `作業タイマー` を選ぶ。

![ScanSession timer](../assets/screenshots/scan-session-timer.png)

## 2. 時計のPhysicalTagを読む

USB NFC / QR readerでタグを読む。

readerを使えない場合は、手入力欄へ `PT-000123` のようなshortCodeを入力して `照合` してもよい。

## 3. 候補を確認

画面に次が表示される。

- 問い合わせ番号
- PhysicalTag shortCode
- `確認して計測開始`

表示されたRepairと手元の時計が一致していることを確認する。

## 4. タイマーを開始

一致していれば `確認して計測開始` を押す。

別作業を計測中なら `現在のタイマーを終了して切替` と表示される。

同じRepairを既に計測中なら重複開始しない。

## 5. エラー時

次の表示が出た場合は無理に続けない。

- 未登録のタグ
- 廃止済みのタグ
- 未割当のタグ
- 複数一致で確認が必要

PhysicalTag / Repairの対応を確認してから再操作する。

## 注意

PhysicalTagをscanしただけではRepair.statusは変わらない。タイマーも確認ボタンを押すまでは開始しない。
