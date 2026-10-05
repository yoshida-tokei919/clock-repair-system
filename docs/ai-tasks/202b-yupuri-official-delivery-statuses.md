# Task202B — ゆうプリR発送履歴の公式配達ステータス表示

Status: production complete.

## Primary source

- 日本郵便株式会社『ゆうプリR ８．入出力インターフェース仕様書』2025-08-07、[公式PDF](https://www.post.japanpost.jp/yu-packprint-r/member/download/instructions/%EF%BC%98%EF%BC%8E%E5%85%A5%E5%87%BA%E5%8A%9B%E3%82%A4%E3%83%B3%E3%82%BF%E3%83%BC%E3%83%95%E3%82%A7%E3%83%BC%E3%82%B9%E4%BB%95%E6%A7%98%E6%9B%B8.pdf)。
- 第3章「発送履歴データ 出力項目一覧」は、仮引受確定作業年月日と配送完了作業年月日を各14バイト、配達ステータス集約コードを2バイト、配達ステータス明細コードを4バイトとしている。
- 第10章「配達ステータスコード一覧」（10-1～10-3頁）の組み合わせと日本語説明を `src/lib/yupuri-history.ts` に転記した。表の `-` は説明なしとして扱う。表に存在しない組み合わせとは別のwarningを返す。

## Boundary and behavior

- Task202Aの認証済みAdmin向け `POST /api/shipments/yupuri-history/preview` とresponse fieldを維持する。日本郵便専用のcode pair→公式説明のadapterだけを拡張する。
- `confirmedDescriptionOrNull` は第10章に説明がある組み合わせでのみ公式表記を返す。`-` の組み合わせはnullと「公式表にはあるが説明なし」のwarning、表にない組み合わせはnullと既存の未確認warningにする。
- `importableLater` はrow errorなし、Shipment存在、公式説明ありの場合だけtrue。将来の取込候補を示すだけで、引受・発送済み・配達済みのShipment状態判定や書込承認ではない。
- 仮引受確定作業年月日と配送完了作業年月日はraw文字列のまま返す。14バイトという長さだけから日時形式やタイムゾーンを推測しない。
- Shipment / Repair / trackingNumber / status / actualShippedAt / deliveredAtのmutationなし。schema / migration / RLS / GRANT、LINE、UIの変更なし。

## Remaining evidence gap

非空の14バイト日付値を含む実際の発送履歴CSVがまだない。日時をparseしてtimestampへ書く前に、実CSVで書式と意味を確認する必要がある。日本郵便の公式説明があるcode pairでも、このTaskではShipment状態へ正規化しない。

## Local validation

- 発送履歴parser + preview route focused tests: 11/11 PASS。Node test runnerと`tsx`はこの環境の`spawn EPERM`で起動できなかったため、TypeScriptの直接transpile loaderで同じtest fileを実行した。
- TypeScript `--noEmit --incremental false`: PASS（Prisma Client生成後）。
- `git diff --check`: PASS。
- `npm run build`: PASS、static pages 56/56。
- Local validation時点ではProduction pending。DB変更 / LINE送信なし。
## Production completion — 2026-10-05

- Application commit: `cb7f6260ec7a1a3410344a02ff19be5b3b23ad8b` — `feat: map official yu-pri delivery statuses`。
- Deploy source: GitHub `main` → Railway。
- Railway deployment: `11e5aef5-fee0-4892-bebd-e50ce40dcc8f` — SUCCESS、region `sin`。
- Railway build: Prisma Client生成、Next.js compile / type check PASS、static pages 56/56。
- Runtime: Next.js 15.5.27、Ready in 677ms。
- Production tag: `production-task202b-20261005`。
- Production smoke: `/`=200、`/login`=200、`/shipments`未認証=307、`/repairs`未認証=307、`POST /api/shipments/yupuri-history/preview`未認証=401。
- Railway HTTP logs: 上記smoke requestの`upstreamErrors`はすべて空。
- schema / migration / RLS / GRANT / production DB mutationなし。LINE送信なし。
- 実際の非空14バイト日時値は引き続き未確認。Task202Bでは日時parse・Shipment/Repair状態更新を行わない。
