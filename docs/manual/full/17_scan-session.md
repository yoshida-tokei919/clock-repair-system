# 第17章 ScanSession

## 17.1 ScanSessionの役割

ScanSessionは、PhysicalTagをNFC / QR / shortCodeで読み取り、同じ現物識別基盤を複数業務へ使うための共通UIである。

管理画面では `WorkTimerBar` の下に常時表示され、現在の「読取モード」に応じて、同じPhysicalTag scanを案件表示・タイマー・複数選択・保管場所・発送確認へ振り分ける。

scanしただけでRepair.statusやShipment等を不可逆に確定しないことを基本方針とする。

## 17.2 読み取り方法

初期運用はPC常設のUSB NFC / QR readerによるkeyboard-wedge / HID入力を優先する。ブラウザWeb NFCへ依存しない。

入力方法は2つある。

- USB readerから高速入力しEnterで確定
- ScanSession上部の手入力欄へNFC UID / QR token / `PT-xxxxxx` shortCodeを入力し「照合」

通常のキーボード入力と誤認しないよう、input / textarea / select / contenteditableへフォーカス中のキー入力はglobal scanとして扱わない。

## 17.3 読取モード

現行ScanSessionには次の8モードがある。

| モード | 画面表示 | 主な用途 | scanだけで状態変更するか |
| --- | --- | --- | --- |
| `OPEN_REPAIR` | 案件を開く | Repair詳細を開く | しない |
| `TIMER` | 作業タイマー | Repair作業時間の開始 / 切替候補 | しない。確認操作が必要 |
| `BATCH_SELECT` | 一括選択 | 汎用の複数Repair選択 | しない |
| `DELIVERY_NOTE` | 納品書対象 | 同一顧客の納品書対象選択 | しない |
| `SHIPMENT_SELECT` | 発送対象 | Shipment作成対象選択 | scan後に人が作成確定 |
| `SHIPMENT_PACKING` | 梱包照合 | Shipment内Repairとの照合 | 梱包確認のみではmutationしない |
| `LOCATION_MOVE` | 保管場所移動 | Location + 複数Repair移動 | 人が移動確定後に変更 |
| `LOCATION_AUDIT` | 保管場所棚卸し | Location上の現物とDB照合 | read-only |

## 17.4 案件を開く

`案件を開く` ではPhysicalTagを1本読むとresolverでRepairを特定し、該当Repair詳細へ移動する。

未登録、廃止済み、未割当、複数一致等では別案件を推測して開かず、エラー表示して止まる。

## 17.5 作業タイマーモード

`作業タイマー` は、作業場で現物から素早くWorkTimeSessionを開始するためのモードである。

![ScanSession timer](../assets/screenshots/scan-session-timer.png)

基本手順:

1. 読取モードを `作業タイマー` にする。
2. 作業する時計のPhysicalTagをscanする。
3. `問い合わせ番号 / shortCode` の候補を確認する。
4. `確認して計測開始` を押す。
5. 画面上部の共通業務タイマーで計測開始を確認する。

別のWorkTimeSessionがactiveの場合は `現在のタイマーを終了して切替` と表示される。

同じRepairのREPAIR timerが既にactiveなら新しいsessionを重複作成せず「既に計測中」と扱う。

### scanだけではタイマーを開始しない

PhysicalTagの取り違え、readerの二重入力等で誤計測を始めないよう、TIMER scanは候補表示までである。人がRepair番号を確認してから開始 / 切替する。

別作業を開始した場合、server側はglobal active WorkTimeSessionを終了し、新しいsessionを同じ時刻境界で開始する。

## 17.6 Repair詳細から明細単位で計測する場合

ScanSession TIMERはRepair単位の `REPAIR` sessionを開始する。

オーバーホール等の特定LABOR明細単位で実績を残す場合は、Repair詳細「作業タイマー」の各技術料明細から `修理開始` を使う。

ScanSessionとRepair詳細のどちらから始めても、active sessionはアプリ全体で最大1件である。

## 17.7 連続選択

`BATCH_SELECT`、`DELIVERY_NOTE`、`SHIPMENT_SELECT`、Location系モードでは、PhysicalTagを連続scanして選択集合を作れる。

重複Repairは2回追加しない。

`DELIVERY_NOTE` と `SHIPMENT_SELECT` は別顧客Repairの混入をblockする。`BATCH_SELECT` は汎用選択のため複数顧客を許容する。

Shipment作成等の詳細は発送章で扱う。

## 17.8 保管場所移動

`保管場所移動` は2段階で読む。

```text
移動先Locationをscan
  ↓
PhysicalTagを1件または複数scan
  ↓
選択内容を確認
  ↓
「この保管場所へ移動」
```

最初のLocation選択だけではRepairは移動しない。PhysicalTagを読んだだけでも移動しない。

## 17.9 棚卸し

`保管場所棚卸し` も先にLocationを読み、その後PhysicalTagを連続scanする。

`棚卸し結果を確認` で、DB上のactive StorageLocationAssignmentとread-only照合する。

- MATCH — 一致
- OTHER_LOCATION — DB上は別場所
- UNASSIGNED — 保管場所未登録
- MISSING — DB上はそのLocationだが現物scanなし

棚卸しだけでは保管場所を修正しない。

## 17.10 resolverの安全動作

PhysicalTag resolverは次の状態を区別する。

- `RESOLVED` — active割当が1件ありRepairを特定できる
- `NOT_FOUND` — 未登録
- `RETIRED` — 廃止済みtag
- `UNASSIGNED` — active Repair割当なし
- `AMBIGUOUS` — 安全に1件へ解決できない

`RESOLVED` 以外では別Repairを推測して続行しない。

## 17.11 連続reader入力の保護

readerをタグ上へ置いたままにした場合等の重複入力を抑えるため、同一raw scanは最後の受付から750ms以内ならdebounceする。

resolver処理中のscanはFIFO queueへ入れる。

- 待機queue最大16件 + 処理中1件
- queue満杯ではエラーを表示して追加しない
- モードを切り替えると候補・選択・queue等の一時状態をclearする
- 古いmodeで開始した非同期結果が新しいmodeへ混入しないようgenerationを使って破棄する

## 17.12 修理作業での標準運用

```text
今日の作業で対象Repairを確認
  ↓
読取モード = 作業タイマー
  ↓
PhysicalTag scan
  ↓
Repair番号 / shortCode確認
  ↓
タイマー開始 / 切替を明示確認
  ↓
実修理作業
  ↓
休憩・終了時にタイマー停止
```

ページ移動やRepair.status変更だけではWorkTimeSessionは自動停止しない。作業終了時は共通タイマーバーの `停止` を確認する。
