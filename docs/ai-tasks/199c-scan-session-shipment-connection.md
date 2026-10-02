# Task199C — ScanSession SHIPMENT_SELECT connection

Status: production complete`nDate: 2026-10-02

## Scope

Task197で用意済みだった `ScanSession / SHIPMENT_SELECT` のselected Repairsを、Task199BのShipment作成server contractへ接続した。

このTaskでは以下のみを扱った。

- PhysicalTag / QR / shortCodeのscanで発送対象Repairを選択
- scanだけではShipmentを作成しない
- 選択一覧を人間が確認した後、明示ボタンでShipment作成
- Task199B `POST /api/shipments` へ `{ repairIds, confirmed: true }` のみ送信
- client側は同一顧客を先行blockするが、server-side再検証を正本とする
- SHIPMENT_SELECTは最大100 Repair
- Repair.status / StorageLocation / PhysicalTag / DeliveryNoteは変更しない
- Task200の発送スケジュール、carrier adapter、追跡、LINE連携は先取りしない

## Application

Application commit:

`4fdcb074dfa6fb8a29074bcb3aa6dd40496720b0`

Commit subject:

`feat: connect shipment scan selection`

変更ファイル:

- `src/components/scan/ScanReceiverBar.tsx`
- `src/components/scan/ScanSessionProvider.tsx`
- `src/lib/scan-session-domain.ts`
- `src/lib/scan-session-domain.test.ts`
- `src/lib/shipment-confirmation.ts`
- `src/lib/shipment-confirmation.test.ts`

## UX / safety boundary

SHIPMENT_SELECTでは、scanされたRepairを選択一覧へ追加するだけでDB mutationは行わない。

人間が一覧を確認し、`このN件で発送を作成` を押した場合のみShipment作成を実行する。

作成中は以下をblockする。

- 追加scan
- mode切替
- 選択解除 / clear
- 二重confirm

queue処理中またはscan処理中もShipment作成ボタンを無効化する。

## Unknown-result duplicate protection

独立レビューで、HTTP POSTのserver commit後にclient通信だけ切れた場合、同じ選択を再送すると重複Shipmentを作成し得る点を検出した。

修正後は以下の動作とした。

- network failureまたは成功HTTPのresponse bodyから正のShipment IDを確認できない場合を `ShipmentResultUncertainError` として型付き判別
- selected Repairsを保持
- `shipmentConfirmationBlocked` を立てる
- 同じ選択ではconfirmボタンを再有効化しない
- UIへ「作成結果が不明です。この選択は再送できません。発送を確認してください。」と表示
- 選択を明示的に変更 / clear / mode変更した場合のみlock解除

これにより、結果不明時の無条件retryによる重複Shipment作成を防止する。

## Independent review

実装担当: Codex`n独立レビュー: カタリ

reviewで以下を検出し、production前に修正した。

1. transport error時に「再送しない」messageは出るが、confirm buttonが再度押せる問題
2. 上記を修正後、同一選択をclient-sideでも再送不能にするunknown-result lockを追加

修正後のblocking finding: なし。

## Local validation

最終状態で以下を確認した。

- `npx tsc --noEmit --incremental false` — PASS
- focused tests — 23/23 PASS
  - ScanSession domain
  - Shipment confirmation client contract
  - Task199B Shipment domain / route regression
- `git diff --cached --check` — PASS
- `npm run build` — PASS
- static pages — 56/56
- schema / migration / canonical roadmap変更なし
- build後のunstaged / generated diffなし

## Production

Deploy source:

GitHub `main` → Railway

Railway deployment:

`a692dd3a-9c06-45fb-98b9-0cb4dda80e0f`

Deployment status:

`SUCCESS`

Deployment source commit:

`4fdcb074dfa6fb8a29074bcb3aa6dd40496720b0`

Region:

`sin`

Runtime:

Next.js 15.5.27, Ready in 263ms

Production tag:

`production-task199c-20261002`

Supabase migration:

none

Production DB mutation:

none

## Production smoke

- `GET /` → 200
- `GET /login` → 200
- unauthenticated `GET /repairs` → 307
- unauthenticated `POST /api/shipments` → 401
- Railway HTTP logsで対象requestの `upstreamErrors` は空

unauthenticated Shipment POSTは認証境界で401となり、Shipment mutationは実行されていない。

## Next

Task199はShipment基盤としてproduction完了。

ロードマップ上の次候補は Task200「発送スケジュール」。

Task200はユーザー承認なしに開始しない。
