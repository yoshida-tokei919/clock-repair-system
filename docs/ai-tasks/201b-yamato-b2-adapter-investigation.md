# Task201B — ヤマトB2クラウド CSV adapter 実装前調査

Status: investigation complete / implementation blocked on account-specific values.
Production: pending.

## Canonical sources checked

- ヤマト運輸FAQ 557「B2クラウドの各入力項目のデータレイアウト」
- 公式PDF `B2クラウド 送り状発行データレイアウト 入出力用`
  - https://bmypage.kuronekoyamato.co.jp/bmypage/pdf/new_exchange1.pdf
- ヤマト運輸FAQ 812「外部データから発行」の基本レイアウトテンプレート
- ヤマト運輸FAQ 406 外部データ取込の文字・住所制約

## Confirmed format

- 送り状発行データは固定順の97項目。
- CSV（カンマ区切り）またはExcelを入力可能。
- 基本レイアウトは列削除・並び替えを行わない。
- 主要項目: お客様管理番号、送り状種類、出荷予定日、配達指定日、配達時間帯、宛先、依頼主、品名、請求先顧客コード、運賃管理番号。
- 通常宅急便の配達時間帯: `0812`, `1416`, `1618`, `1820`, `1921`。空欄は指定なし。
- JIS第一・第二水準を前提とし、環境依存文字は避ける。

## Current app boundary

- Shipment正本は配送会社非依存で、宛先snapshot、plannedShipDate、requestedDeliveryDate / TimeSlotを既に保持する。
- Task201のゆうプリR adapterと同様、Customer current addressへfallbackしない。
- ヤマト固有コードはShipment schemaへ追加せずadapter内へ閉じ込める。
- schema / migration / RLS / GRANT、tracking取込、Shipment mutation、LINEはTask201B対象外。

## Missing account/config evidence

実装前に以下の正本値が必要。

1. B2クラウドの「ご請求先顧客コード」（公式layout No.40、通常宅急便で必須）
2. 「運賃管理番号」（No.42、通常宅急便で必須）
3. 必要な場合の「ご請求先分類コード」（No.41）
4. B2で使用するご依頼主情報の正本。Task201のゆうプリR hard-codeを別adapterへ複製しない。
5. 初期の送り状種類を発払い `0` とするか等、実運用サービスの確定。
6. B2基本CSVで使うheader / 取込み開始行 / 実ファイルencodingを、公式テンプレートまたはB2から受理された実サンプルで最終固定する。

これらを推測してCSVを生成しない。

## Proposed implementation once evidence is supplied

- `yamato-b2` adapterをTask201とは別moduleにする。
- authenticated Admin専用のread-only export endpointを追加する。
- `SHP-{Shipment.id}` をお客様管理番号として機械照合可能にする。
- 97項目を公式順で生成し、未使用列も位置を保持する。
- unsupported service / time-slot / 文字 / 必須値欠損はfail closed。
- Shipment / Repair / tracking / statusをexportでは変更しない。
- 公式テンプレートまたは実取込PoCと列数・必須項目・encodingを照合してからproductionへ進む。

## Next evidence to obtain

B2クラウド画面で請求先情報を確認し、基本レイアウトテンプレート（またはB2で実際に受理された1件分のCSV）を保存する。契約固有コードはチャットへ貼らず、production設定時に安全な設定値として扱う。
