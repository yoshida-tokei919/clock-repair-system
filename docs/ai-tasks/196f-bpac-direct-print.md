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

Production: pending. 実装・local validation後、独立レビュー、commit、production反映判断を別工程で行う。

## Independent review

- Codex codex-auto-review で未commit差分を独立レビュー。blocking findingなし。直接印刷要件、QL-800 fail-closed、QR privacy、既存preview維持、focused tests / TypeScript / production buildの整合を確認。
