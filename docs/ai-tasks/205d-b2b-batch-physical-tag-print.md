# Task205D — B2B一括受付後のPhysicalTag準備・直接印刷

Production: pending

## Scope

- `/repairs/b2b-intake` の登録成功結果一覧に、明示的な「管理タグを準備して印刷」操作を追加。受付完了だけではタグ発行も印刷もしない。
- 管理者認証済みの `POST /api/physical-tags/b2b-batch-prepare` はRepair IDを1〜30件受け取り、全件の存在、business区分、同一Customerを確認してから準備する。表示・QR用データはDBから取得する。
- 既存の有効なPhysicalTag割当は再利用し、未割当のRepairにだけ新規発行する。割当競合時はactive割当を再取得し、確認できない場合は409で停止する。新規発行はRepairごとのSerializable transaction内でタグと割当を作り、途中失敗の孤立タグを防ぐ。
- ラベルは既存 `physicalTagLabel()` を使用し、QR payloadは `qrToken` のみ。ブラウザは既存 `printPhysicalTagLabel()` を1枚ずつ順に呼び、Brother QL-800 / DK-2205の直接印刷経路を使う。
- 印刷例外では直ちに停止。完了した件数と結果不明のRepair / PhysicalTagを示し、該当1枚の現物確認または明示再印刷後に、未試行分だけを続行できる。完了後の全件操作は「再印刷」と表示する。

## Safety and idempotency

- 準備APIは繰り返してもactive割当を再利用し、release・replace・reissueしない。新規タグの一部発行後に通信結果が不明でも、同じRepair IDで再準備できる。
- 印刷結果が不明な1枚は自動再試行せず、後続も自動印刷しない。`PrintOut`後の`EndPrint`失敗でも出力済みの可能性があるため、現物確認を明示する。
- 準備・印刷中は同一画面の二重実行を防ぐ。既存の単件PhysicalTagPanelと `/api/physical-tags/issue` は変更しない。
- schema / migration / RLS / GRANT、B2C、Shipment、StorageLocation、LINE、PDFへの変更なし。

## Validation

- Task205D focused tests: 5/5 PASS。入力上限・重複、欠損/B2C/別顧客の拒否、active再利用、不足分のみ発行、順序、正本ラベルとQR privacy、割当競合時の再取得、印刷停止と未試行分再開を確認。
- 既存回帰: b-PAC直接印刷 14/14 PASS、PhysicalTag単発発行 5/5 PASS、発行route認証 1/1 PASS。
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- `node node_modules/next/dist/bin/next build`: PASS（static pages 57/57）。
- Brother QL-800実機の一括印刷は未確認。単件直接印刷経路はTask196Fの既存実装を再利用。
- Codex実装後にカタリが独立read-onlyレビューと上記検証を実施し、blocking findingなし。

Production deploy / push: pending.
