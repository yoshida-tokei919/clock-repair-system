# Task201C — ゆうプリクラウド CSV出力adapter

Status: local implementation / review pending

Production: pending

## Source of truth

- 日本郵便「送り状発行サービス（ゆうプリクラウド）操作説明書 -Ver4.0-」2026/8/25、付録Ⅰ「送り状データレイアウト」を一次資料とする。
- 公式説明書: `https://www.post.japanpost.jp/yu-pri-cloud/member/VariousContents/%E3%82%86%E3%81%86%E3%83%97%E3%83%AA%E3%82%AF%E3%83%A9%E3%82%A6%E3%83%89%E6%93%8D%E4%BD%9C%E8%AA%AC%E6%98%8E%E6%9B%B8.pdf`
- CSV取込は UTF-8 / Shift-JIS に対応。公式資料はUTF-8を推奨し、文字コード判別不能時はUTF-8 BOM付での再取込を案内している。
- このTaskではUTF-8 BOM付、headerあり、CRLF、1 Shipment = 1 data rowで生成する。
- Webゆうプリ用テンプレートではなく、17列を1:1で紐付けるゆうプリクラウド側のカスタム取込フィルタを前提とする。

## Adapter contract

Admin認証済みの `GET /api/shipments/[id]/yupuri-cloud` からread-onlyでCSVを生成する。
既存 `GET /api/shipments/[id]/yupuri-v3` はfallbackとして変更しない。

列順は以下で固定する。

1. 送り状種別
2. 荷物商品名
3. 個口数
4. お客さま管理番号（受注番号等）
5. 品名1
6. サイズ
7. お届け先郵便番号
8. お届け先住所1
9. お届け先氏名1
10. お届け先電話番号
11. ご依頼主郵便番号
12. ご依頼主住所1
13. ご依頼主氏名1
14. ご依頼主電話番号
15. 発送予定日
16. 配達希望日
17. 配達希望時間帯

固定値 / code:

- 送り状種別 `0` = シート式ラベル（ユ00783）
- 荷物商品名 `101` = 元払ゆうパック
- 個口数 `1`
- お客さま管理番号 `SHP-{Shipment.id}`
- 品名1 `腕時計`
- サイズ `060`
- 配達希望時間帯 `00 / 51 / 52 / 53 / 54 / 55 / 57`

## Shipment boundary

- OUTBOUND、未発送、statusが `DRAFT / READY / LABEL_ISSUED / AWAITING_ACCEPTANCE` のShipmentのみexport可能。
- 宛先はShipment destination snapshotのみを使用し、Customer current addressへfallbackしない。
- `plannedShipDate` はTask201互換で必須とし、`YYYYMMDD`で出力する。過去日はfail closed。
- `requestedDeliveryDate` は任意。設定時は`YYYYMMDD`。
- `requestedDeliveryDate=null` かつ `requestedDeliveryTimeSlot=null/blank` は未回答として両列を空欄にする。
- 明示的な「指定なし」は`00`。日付だけ指定され時間帯がnull/blankの場合も既存Task201と同じく`00`。
- 現行B2C配達希望フローのtime-only回答も許容する。

## Validation

- お客さま管理番号は16文字以内の半角英数字・記号。
- お届け先郵便番号は現行Task201に合わせ7桁数字を要求。
- お届け先住所1は必須・75文字以内。
- お届け先氏名1は必須・50文字以内。
- お届け先電話番号はShipment snapshotを必須扱いとし、0始まり、数字/ハイフン、数字のみで10〜11桁を要求。
- CR/LF/NULをfield内に許容しない。
- 住所・氏名等は公式の「半角文字列またはJIS基本漢字（JIS X 0208）」制約に対する実用的なfail-closed guardとしてCP932 round-tripを使う。
- CP932 round-tripはJIS X 0208の厳密判定ではない。emoji等の明白な非対応文字を弾くための近似guardであり、厳密な文字集合保証とは扱わない。

## Out of scope

- schema / migration / RLS / GRANT / production DB mutation
- ゆうプリクラウド画面への自動login / Playwright操作
- CSV upload、送り状PDF発行、trackingNumber writeback
- 発送status / 配達status同期
- Shipment / Repair / LINE / PhysicalTag / StorageLocation mutation
- `/shipments` UI変更
- カスタム取込フィルタの実サービス上での作成・実取込PoC

## Verification status

- Local unit / route tests + existing Yu-Pri R V3 regression: 18/18 PASS
- TypeScript (`tsc --noEmit --incremental false`): PASS after local Prisma Client generation

- `git diff --check`: PASS
- `npm run build`: PASS (Next.js 15.5.27, static pages 57/57)
- ゆうプリクラウド実サービスへのCSV取込PoC: 未確認
- Playwright / live login: 未実施
- 統括独立レビュー: blocking findingなし

Production: pending. ゆうプリクラウド実サービスPoCとproduction deployはユーザーの明示承認なしに実行しない。
