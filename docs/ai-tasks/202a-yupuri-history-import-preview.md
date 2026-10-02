# Task202A — ゆうプリR発送履歴CSVの読取プレビュー

Status: local implementation committed; independent review pending. Production: pending.

## Primary evidence and contract

- Desktopを再帰探索し、`ゆうプリR_PoC/shipping_history.csv`の実バイトを直接確認した（178 bytes）。
- CP932で復号して再符号化したバイト列が一致。BOMなし、CRLF、ヘッダーあり、6列、データ1行。
- 実ヘッダーの順序: `お客様側管理番号`, `お問い合わせ番号`, `仮引受確定作業年月日`, `配送完了作業年月日`, `配達ステータス集約コード`, `配達ステータス明細コード`。
- 実データ: `POC003`, `193715301010`, 空欄, 空欄, `10`, `0A`。PoCの管理番号はTask201の `SHP-{Shipment.id}` 形式ではないため、previewでは行エラーになる。
- 正本roadmapで意味が確認済みの組は `10/0A = 引受予定` のみ。実引受・配達完了のコードおよび非空日付の書式は未確認。

| CSV列 | previewのfield |
| --- | --- |
| お客様側管理番号 | `managementNumber` → `resolvedShipmentId` / `shipmentFound` |
| お問い合わせ番号 | `trackingNumberCandidate` |
| 仮引受確定作業年月日 | `acceptanceRelatedValue`（raw） |
| 配送完了作業年月日 | `deliveryCompletionCandidate`（raw） |
| 配達ステータス集約コード | `aggregateStatusCode`（raw） |
| 配達ステータス明細コード | `detailStatusCode`（raw） |

## Architecture and boundaries

- `src/lib/yupuri-history.ts`は日本郵便専用のCP932復号、6列ヘッダー照合、CSV構文解析、行検証、重複と照合先Shipmentの既存追跡番号との比較を担当する。
- `POST /api/shipments/yupuri-history/preview`はNextAuth sessionとemailに一致するAdminを確認した後、multipart `file`を読む。PrismaはAdminの`findUnique`とShipmentの`findMany`のみ。検証済みの解決Shipment IDだけをまとめてreadし、IDがなければShipmentをreadしない。
- 管理番号は `^SHP-([1-9][0-9]*)$`、JavaScript safe integerかつPrisma Intの正の範囲、DB存在を検証する。
- 重複管理番号、同一Shipmentへの重複解決、同一Shipmentの異なる追跡番号候補、照合先Shipmentの不存在、照合先Shipment.trackingNumberとの不一致を各行のerrorへ明示する。
- お問い合わせ番号候補は空白のみでない値を要求し、CSVから読み取ったraw文字列を保持する。引用符内のカンマや二重引用符もCSV構文に従って読み取る。
- 日付相当2列はraw文字列の候補として保持しDateへ変換しない。status codeもraw文字列のまま返す。未知の組はdescription=nullとwarningにし、発送済み・配達済み等を推定しない。
- `importableLater`はerrorなし、DBにShipmentあり、かつ確認済みの`10/0A`の行だけに立つ将来向けの候補表示で、書込の承認や発送状態の判定ではない。
- ファイル全体の空、header不一致、BOM、CP932往復不一致、CSV引用符の破損、上限超過はfail closed。列数不足・超過、追跡番号候補の空欄・空白のみ、管理番号不正は行error。
- CP932/BOMなしは実CSVの一次証拠から固定した。UTF-8/BOM対応の一次資料がないため受け付けない。ASCIIだけのバイト列は両encodingで同形だが、日本語の必須ヘッダー照合により履歴ファイルとしては通らない。
- repoに履歴CSV用の上限がないため、1ファイル256 KiB、データ500行を上限とした。通常の小規模手動previewには余裕を持たせつつ、multipartのメモリ展開とDBの単一batch readを抑えるための保守的な値。
- Shipment / Repairのstatus、trackingNumber、actualShippedAt、deliveredAt等は更新しない。schema / migration / RLS / GRANT、UI、LINE、PhysicalTag、StorageLocation、ScanSessionは変更しない。

## Validation

- Focused parser/route tests: 9/9 PASS（parser 8/8、route 1/1）。
- Shipment regression: domain 6/6, route 2/2, schedule 7/7, confirmation 5/5, total 20/20 PASS.
- Task201 regression: adapter 8/8、route 1/1 PASS。
- `npx --no-install tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- `npm run build`: PASS、static pages 56/56。
- Desktop PoC実ファイルをparserに直接通し、`POC003`の管理番号形式errorと`10/0A = 引受予定`を確認した。

## Task202B follow-up

- 実際の郵便局引受後と配達完了後の発送履歴CSVを一次資料として取得し、code pairと非空日付書式を確認する。
- trackingNumberおよびShipment/Repairの状態保存は、その証拠に基づく別Taskで設計・レビューする。
- 書込時の冪等性、並行更新、監査、再取込、1Repair複数Shipment、通知条件を別途定義する。
