# Task196/197 PhysicalTag・NFC / QR 現物連携 設計

## Status

- Date: 2026-09-28
- Type: requirements / design only
- Implementation: not started
- Roadmap: Task196 PhysicalTag foundation / Task197 ScanSession
- Current Task193C2の実装・production境界は変更しない。

## 背景

作業場では修理時計のそばに常時PCがあり、USB NFCリーダーとQRリーダーを常設できる。
従来の「案件ごとのQRを読み、案件詳細へ移動する」だけではなく、現物識別を受付・作業時間計測・納品・発送へ横断利用する。

## 決定事項

- 主運用はNFCとする。
- QRはフォールバックとして必ず残す。
- 人間が読めるshortCodeを第3の識別手段として持つ。
- NFC / QR / shortCodeは同じ論理PhysicalTagを指す。
- タグは時計本体へ直接貼らず、収納袋・保管トレー・再利用可能なタグホルダー等へ付ける。
- PC側の初期実装はUSBリーダーのkeyboard-wedge/HID入力を優先する。
- ブラウザWeb NFCを必須技術にしない。
- タグ上に顧客名、電話番号、住所等の個人情報を保存しない。
- NFC UIDは検索キーであり、認証情報・秘密鍵として扱わない。
- QRには推測困難なrandom tokenを使用し、連番Repair IDを直接埋め込まない。
- Repair情報の表示・更新には既存管理画面の認証を必須とする。
- PhysicalTagは再利用可能とし、Repairとの割当履歴を残す。

## 論理データモデル

### PhysicalTag

タグそのものを表す。候補属性は以下。

- id
- shortCode
- nfcUid
- qrToken または qrTokenHash
- tagType / capabilities（NFC, QR, BOTH）
- status（ACTIVE / RETIRED等）
- createdAt / retiredAt

field名、tokenの平文/ハッシュ方式、enumはTask196実装前調査で現行schemaと照合して確定する。

### PhysicalTagAssignment

PhysicalTagをRepairへ割り当てた期間を表す。

- physicalTagId
- repairId
- assignedAt
- releasedAt
- assignReason / releaseReason（必要性を実装前に判断）
- 操作者監査情報（既存監査方式に合わせる）

1 PhysicalTagにつきactive assignmentは最大1件とする。
1 Repairにつきactiveな論理PhysicalTagは原則1件とし、交換時は旧タグをreleaseして新タグへ切り替える。

## タグのライフサイクル

1. 使用可能なPhysicalTagを用意する
2. 現物受領時にRepairへassignする
3. 修理中は同じPhysicalTagで案件表示・タイマー等を行う
4. タグ破損/紛失時は旧タグをrelease/retireし、新タグへ交換する
5. 最終梱包時に現物とRepairを照合する
6. 発送・引渡し前に再利用タグをreleaseする
7. release後のタグは別Repairへ再assignできる

タグを顧客へ誤って発送しない運用を、Shipment実装時の確認項目に含める。

## Reader / scan入力契約

- 初期対象はUSB NFC readerとUSB QR reader。
- keyboard-wedge/HIDとしてブラウザへ文字列入力できる構成を優先する。
- reader側のprefix / suffix / Enter terminatorを利用できる場合は通常キー入力との誤認防止に使う。
- UID表記の大文字小文字、区切り文字、byte order等は実機PoCで固定する。
- 同一タグの置きっぱなしによる連打をdebounceする。
- 複数readerを使う場合も同じscan receiverへ正規化できる設計にする。
- PC/SCやローカルbridgeはkeyboard-wedgeで不足が出た場合の後続候補とする。

## ScanSession

scanの意味を画面ごとに個別実装せず、共通のscan receiver / sessionとして扱う。
初期mode候補:

- OPEN_REPAIR: 1件scanしてRepair詳細を開く
- TIMER: scanしたRepairのWorkTimeSession開始/切替候補を出す
- BATCH_SELECT: 複数Repairを連続追加する
- DELIVERY_NOTE: 納品書作成対象を連続選択する
- SHIPMENT_SELECT: 将来のShipment作成へ渡す複数Repair選択
- LOCATION_CHECK: 将来の所在確認 / 棚卸し

Task197ではShipment schemaへ先行依存せず、SHIPMENT_SELECTはRepair選択結果を後続Taskへ渡せる共通契約までとする。
Task198でStorageLocation・現物保管場所管理へ接続し、実Shipment作成・梱包照合はTask199以降で接続する。

## 連続scanの安全要件

- 同一session内の重複Repairは二重追加しない。
- 未登録UID/tokenを明示する。
- retired tagを明示する。
- active assignmentがないタグを明示する。
- delivery / shipment系では別顧客のRepair混入を検知する。
- 別顧客混入は初期値として追加を止め、ユーザーが状況を確認できるようにする。
- scan成功/失敗は画面表示と短い音等で即時フィードバックできるようにする。
- 納品書生成、Shipment確定、status変更等はscanだけで自動確定しない。
- 状態変更前に対象Repair一覧を人間が確認できるようにする。

## 実機PoCで確認する項目

- 時計を収納した袋/トレー近傍でのNFC読取安定性
- 金属ケースによる読取距離低下
- 必要ならanti-metal tag / spacerの要否
- USB NFC readerのUID keyboard emulation
- QR scannerのkeyboard-wedge入力
- prefix / suffix設定可否
- 同一タグ置きっぱなし時の入力挙動
- 連続して複数タグを読む速度
- 読み取りUIDのformat固定性
- QRラベルの必要サイズと印刷品質
- NFCタグとQR印字を一体化するか、同一論理タグとして別部材にするか

## Task境界

### Task196

- 実機PoC結果の確定
- PhysicalTag / PhysicalTagAssignment schema
- lookup API
- assign / release / replace
- shortCode検索
- QR token解決
- NFC UID解決
- QR付きタグ表示/印刷の最小導線
- migration / RLS / GRANTを含む場合は高リスクTaskとして独立レビュー

### Task197

- 共通scan receiver
- ScanSession
- OPEN_REPAIR
- TIMER
- BATCH_SELECT / DELIVERY_NOTE
- SHIPMENT_SELECTの共通selection契約
- 重複/未割当/別顧客等のguard
- 実Shipmentへの書込は行わない

### Task198

- StorageLocation / 現物保管場所管理へscan基盤を接続
- ケース / 棚のLocationタグをscanし、時計の移動先を記録できるようにする
- 案件状態と実保管場所の不一致検知へ利用する

### Task199以降

- SHIPMENT_SELECTをShipment作成へ接続
- 梱包時に連続scanしてShipment構成と照合
- 発送直前のPhysicalTag release確認

## 初期スコープ外

- UHF RFIDによる離れた場所からの一括読取
- NFCを時計本体へ直接貼り付ける運用
- NFC UIDだけを認証に使うこと
- 未認証ユーザーへRepair情報を公開すること
- scanしただけで納品/発送/status変更を不可逆に確定すること
- ブラウザWeb NFC必須化
- Windows常駐service必須化

## 完了判定の考え方

PhysicalTagは「QR機能」ではなく、現物とデジタルRepairを結ぶ基盤として扱う。
NFCが通常導線、QRが機器障害時・別端末時のフォールバック、shortCodeが最終フォールバックとなる。
最終的に、現物受領から作業、納品書対象選択、Shipment梱包確認まで同じPhysicalTagで追跡できることを目標とする。
