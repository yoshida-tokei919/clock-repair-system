# Task196F — Brother QL-800 / b-PAC direct PhysicalTag printing

## Scope

- Repair詳細の既存PhysicalTagから、Brother QL-800へ1クリックで62 × 75 mmラベルを直接印刷する。
- Windows既定プリンターへ依存せず、印刷先は `Brother QL-800` を明示指定する。
- 既存PDFラベルは予備の「プレビュー」導線として維持する。
- 再印刷は既存PhysicalTagをそのまま使用し、新しいPhysicalTagを発行しない。
- 将来のB2B一括印刷で再利用できるよう、1枚印刷処理を `printPhysicalTagLabel()` として分離する。

## Hardware / browser PoC

2026-10-05にWindows 10 / Edge / Brother QL-800 / DK-2205で確認した。

- b-PAC3 Client / SDK 3.4.0170 32-bit と Brother b-PAC Extension 3.4.3.2を使用。
- Edge → Extension → Native Messaging → b-PAC → QL-800 の接続を確認。
- `SetPrinter("Brother QL-800", false)` が成功し、Windows既定プリンターがNEC MultiWriter 5750CでもQL-800へ固定できることを確認。
- QL-800 ONLINE、装着メディア `62mm` を取得できることを確認。
- 62 × 75 mm documentはb-PAC内部単位 `Width=3514`, `Length=4252`。
- `StartPrint(..., 1)` → `PrintOut(1, 0)` → `EndPrint()` で1枚印刷とauto-cutを実機確認。
- HTTP URL上の `.lbx` を `IDocument.Open()` できることを確認したため、runtimeはローカル固定パスではなくアプリ配下のabsolute URLを使用する。

## Implementation

- `public/bpac/physical-tag-62x75.lbx`
  - Brother SDK再配布可能テンプレートAsset1を土台にしたQL-800 / 62mm / 75mmテンプレート。
  - named objects: `objInquiry`, `objShortCode`, `objInfo`, `objQr`。
  - QRはQRCODE / model 2 / ECC 15% / marginあり。32文字qrTokenで約27.94 mmをb-PAC再読込で確認。
- `src/vendor/bpac.js`
  - Brother SDKの再配布可能公式JavaScriptをそのままvendor化。コピー元とのSHA-256一致を確認。
- `src/vendor/bpac.d.ts`
  - Task196Fで利用する最小APIだけのTypeScript宣言。
- `src/lib/bpac-physical-tag-print.ts`
  - Extension確認、テンプレートOpen、QL-800固定、installed/online/media/template寸法preflight、named object差し込み、1枚auto-cut印刷、Closeをfail-closedで実行する。
  - 他プリンター・OS既定プリンター・PDF印刷への自動fallbackは行わない。
- `src/components/repairs/PhysicalTagPanel.tsx`
  - primary `ラベル印刷` とsecondary `プレビュー` に分離。
  - 印刷中はボタンをdisableし、同一クリック中の重複印刷を防止。
  - 成功/失敗を画面表示する。

## Label data / privacy

- ラベルデータは既存 `physicalTagLabel()` を正本として再利用する。
- B2C/B2Bの顧客名、取引先管理番号、エンドユーザー、brand/model/Ref/serial/Cal/receptionDate/shortCodeの選択規則を維持する。
- QR payloadは従来どおり `PhysicalTag.qrToken` のみ。
- Repair database ID、inquiry number、顧客名等のPIIをQRへ追加しない。
- 長い表示値は1行ごとに明示truncationし、固定テンプレートを崩さない。

## Local validation

- Task196F focused direct-print tests: PASS。
  - QL-800明示指定、1 copy、auto-cut option=1、exact qrPayload。
  - Extensionなし、QL-800なし/offline、誤メディア、誤template media/寸法、SetPrinter失敗をfail closed。
  - PrintOut失敗時もEndPrint / Closeを試行。
  - B2C/B2B表示と長文truncation。
- Existing PhysicalTag issue/label domain tests included in focused run: PASS。
- Existing `TagDocument.test.tsx` は未変更だが、tsx単体実行環境で1件 `ReferenceError: React is not defined`。Task196F direct-print assertion failureではない。
- TypeScript `tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- `npm run build`: PASS。Next.js 15.5.27 compile/type check成功、static pages 56/56。

## Data / production impact

- schema変更なし。
- migrationなし。
- RLS変更なし。
- GRANT変更なし。
- production DB mutationなし。
- PhysicalTag lifecycle変更なし。
- LINE / Shipment変更なし。

Production: complete.

## Production completion — 2026-10-05

- Initial application commit: `c89c0a57b01af81890bf9d83c5e341a6489c3031` — `feat: add direct physical tag label printing`
- Production hotfix commit: `1b2a385a651611ce96975b37048a0de878d93a0b` — `fix: bind b-PAC text objects by name`
- Final production source: GitHub `main` at `1b2a385a651611ce96975b37048a0de878d93a0b`
- Initial Railway deployment: `cba6cd3b-25c4-4435-8ffa-da0290798f63` — SUCCESS
- Hotfix Railway deployment: `453f9c30-7d91-4b1e-b765-a2f527cfe7cf` — SUCCESS
- Railway production build: compile / type check PASS、static pages 56/56。hotfix runtimeはNext.js 15.5.27、Ready in 251ms。
- Initial production smokeで `.lbx` 内に `objInquiry` が実在するにもかかわらず、text objectを `GetTextIndex("objInquiry")` で名前検索したため `-1` となる不具合を検出。
- Brother公式方式の `GetObject("objInquiry").Text = ...` へtext 3項目だけを最小修正。QRのbarcode index経路、QL-800固定、62mm / 75mm preflight、auto-cut、fail-closedは維持。
- Hotfix validation: focused tests 19/19 PASS、TypeScript PASS、`git diff --check` PASS、production build 56/56 PASS。実機b-PAC COMで `objInquiry` / `objShortCode` / `objInfo` のText書込みと `objQr` barcode index=0を印刷なしで確認。
- Hotfix独立read-only Codex review: final findings 0件。
- Production実機smoke: Repair `C-003` / PhysicalTag `PT-000002` で直接印刷を実行し、QL-800から1枚のみ出力、75mm auto-cut、C-003 / PT-000002 / 案件情報の印字、QR読取の4条件をユーザー確認済み。
- 再印刷でPhysicalTag再発行なし。既存 `PT-000002` をそのまま使用。
- schema / migration / RLS / GRANT / production DB mutationなし。

## Independent review

- Codex codex-auto-review で未commit差分を独立レビュー。blocking findingなし。直接印刷要件、QL-800 fail-closed、QR privacy、既存preview維持、focused tests / TypeScript / production buildの整合を確認。
