# 修理作業・完了連絡編 印刷見本

版: 0.1
作成日: 2026-10-05

「今日の作業」から現物scanで修理を開始し、実作業時間を止め、作業完了・ランニングテスト・LINE作業完了連絡まで進める印刷レイアウト見本。

画面例は実顧客データを使用せず、実コンポーネントまたは現行UI構造へマニュアル用合成データを表示している。

## 1. PhysicalTagから作業を開始する

ScanSessionの読取モードを `作業タイマー` にし、時計現物のPhysicalTagを読む。

![ScanSession timer](../assets/screenshots/scan-session-timer.png)

PhysicalTagをscanしただけではタイマーは始まらない。問い合わせ番号とshortCodeを確認し、`確認して計測開始` を押す。

別作業を計測中なら、現在のactive sessionを終了して新しいRepairへ切り替える。

<div style="page-break-before: always;"></div>

## 2. 修理終了時はタイマーを先に停止する

実修理作業が終わったら、画面上部の共通業務タイマーで `停止` を押す。

Repair.statusを変更しただけではWorkTimeSessionは自動停止しない。

その後、Repair詳細でstatusを `作業完了` へ変更する。

![Repair work complete](../assets/screenshots/repair-status-work-complete.png)

**重要:** `作業完了` は修理作業工程の完了であり、ランニングテスト完了や発送可を意味しない。

<div style="page-break-before: always;"></div>

## 3. ランニングテスト中へ現物を移す

`作業完了` で `blocked=false` の通常ケースでは、StorageLocationの推奨zoneが `ランニングテスト中` になる。

![Running test location](../assets/screenshots/running-test-location.png)

`blocked=true` の場合は中断理由の推奨zoneを優先する。画面の推奨zoneを確認し、現物を実際に移動した後でScanSession `保管場所移動` からLocationAssignmentを更新する。

現行アプリにはランニングテスト開始 / 完了日時やテスト結果を保存する専用イベントはまだない。Shipment画面でも完了判定は `判定不可` である。

テスト・最終確認は人が行い、問題がなければ現物を `発送・引渡し待ち` へ移して次工程へ進む。

<div style="page-break-before: always;"></div>

## 4. 作業完了LINEの最終文面を確認する

B2C案件ではRepairのLINEタブに `作業完了のLINE連絡` が表示される。

標準冒頭文を確認・編集し、`送信内容を確認` を押すと配達希望回答URLと「希望なし」案内が自動追加される。

![Completion notice review](../assets/screenshots/completion-notice-review.png)

内容を確認してから `この内容で送信待ちに追加` を押す。

Repair.statusを `作業完了` にしただけではLINEは送られない。

<div style="page-break-before: always;"></div>

## 5. 「送信待ち」と「送信済み」を区別する

送信待ちへ追加した時点では `APPROVED` であり、LINE Manager側の送信確認はまだ完了していない。

```text
APPROVED
  ↓ local sender
CLAIMED
  ↓ durable fence
POST_UNCONFIRMED = 実送信結果未確定
  ↓ LINE ManagerへPOSTを試行
  ↓ 履歴照合
CONFIRMED
```

`POST_UNCONFIRMED` はPOST前のdurable fenceで設定されるため、POST済みの場合とPOST前に止まった場合の両方を含み得る。同じ内容を手動再送せず、状態確認を優先する。

<div style="page-break-before: always;"></div>

## 6. CONFIRMEDを確認する

正常にLINE Manager履歴で確認できると、`作業完了連絡: 送信済み` と送信確認日時が表示される。

![Completion notice confirmed](../assets/screenshots/completion-notice-confirmed.png)

`CONFIRMED` はLINE送信実績であり、顧客の配達希望回答済みを意味しない。回答状況は次の配達希望工程で確認する。

## 7. 現行の安全な基本フロー

以下はblocked等の優先条件がない通常ケース。blocked中は画面の推奨zoneと中断理由を優先する。

```text
PhysicalTag scan
  ↓
タイマー開始 / 切替を確認
  ↓
実修理作業
  ↓
タイマー停止
  ↓
Repair = 作業完了
  ↓
現物をランニングテスト中へ移動
  ↓
ランニングテスト・最終確認
  ↓
現物を発送・引渡し待ちへ移動
  ↓
LINE最終文面を確認
  ↓
送信待ちへ追加
  ↓
CONFIRMED確認
  ↓
配達希望回答 / Shipment工程へ
```
