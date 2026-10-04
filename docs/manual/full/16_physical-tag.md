# 第16章 PhysicalTag / QR / NFC / shortCode

## 16.1 PhysicalTagの役割

PhysicalTagは、時計現物とアプリ上のRepairを結び付けるための管理タグである。
単なる「案件詳細を開くQR」ではなく、受付後の現物識別、作業タイマー、保管場所移動、棚卸し、納品書対象選択、Shipment梱包照合まで同じ識別基盤を使う。

管理タグは時計本体へ直接貼らず、時計を入れる修理袋・トレー・タグホルダー等へ付ける。

## 16.2 3つの識別方法

1つのPhysicalTagには、用途の異なる識別手段を持たせる。

- **NFC UID** — 通常の高速読取用。UIDは検索キーであり、認証情報や秘密鍵ではない。
- **QR token** — NFCを使えない場合のフォールバック。推測困難なrandom tokenを使用する。
- **shortCode** — 人が目視・手入力できる最終フォールバック。現在は `PT-000123` のような形式。

QRにはRepair ID、受付番号、顧客名等を直接埋め込まない。QR payloadはopaqueな `qrToken` のみである。

## 16.3 現物受付後の発行

顧客受付フォーム送信直後のRepairは `送付待ち` で、まだ現物が工房へ届いていない。
現物到着後にRepairを `受付` へ進め、現物とRepairを照合した後でPhysicalTagを発行・割当する。

通常の順序は次のとおり。

1. 荷物を開封し、顧客・時計・受付番号を照合する。
2. Repair statusを `送付待ち → 受付` に変更する。
3. Repair詳細の「PhysicalTag / 管理タグ」を確認する。
4. 必要ならNFC UIDを読み取り、管理タグを発行する。
5. 発行後のshortCodeを確認する。
6. 62 × 75 mmの修理袋ラベルを印刷する。
7. StorageLocationを登録する。

![PhysicalTag panel](../assets/screenshots/physical-tag-panel.png)

## 16.4 NFC UIDは任意

管理タグ発行時のNFC UIDは任意である。
NFC UIDを入力しなくてもQR + shortCodeのPhysicalTagを発行できる。

R65等のreader固有のbyte order、区切り、10進/16進変換、prefix/suffix等をアプリ側で推測して補正しない。実機から得られた形式を確認したうえで扱う。

## 16.5 PhysicalTagとRepairの割当は履歴管理

PhysicalTagそのものとRepairへの割当は分離している。

- PhysicalTag — タグ本体
- PhysicalTagAssignment — どのRepairへ、いつからいつまで割り当てたか

1つのPhysicalTagにactiveな割当は最大1件である。
Repair側もactiveな論理タグは原則1件とし、タグ交換時は旧割当をreleaseして新しいタグへ切り替える。

## 16.6 タグは再利用する

修理中は同じPhysicalTagを使い続ける。
発送・引渡し前の梱包照合が完了した後、再利用PhysicalTagを明示確認してreleaseする。

releaseしてもPhysicalTag本体はACTIVEのまま維持でき、別のRepairへ再assignできる。
タグを顧客へ誤って発送しないため、Shipment梱包確認とreleaseは別の確認操作としている。

## 16.7 scanだけで状態変更しない

PhysicalTagをscanしただけで、Repair status、Shipment、納品書、保管場所等を不可逆に確定しない。

scanは「どのRepairか」を解決する入口であり、状態変更が必要な業務では対象一覧や移動先を人が確認してから確定する。

## 16.8 エラー時の考え方

scan時には少なくとも次の例外を区別する。

- 未登録のUID / token / shortCode
- RETIRED tag
- active assignmentがないtag
- 複数候補等で安全に1件へ解決できない状態
- 納品・発送系で別顧客Repairが混入した状態

エラー時は別の案件を推測して開かず、原因を確認してから操作を続ける。
