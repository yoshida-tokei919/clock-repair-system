# Task 107-25: 納品書 /documents/delivery/[id] HTTP 500 調査

## 1. 概要

Task 107-24 の回帰確認中に、納品書ページ `/documents/delivery/4` で本文表示とPDFダウンロードリンク生成は確認できたが、Playwright上のHTTP statusが500になる現象を確認した。

このTaskでは、納品書ページの500原因を調査した。コード修正は行っていない。

## 2. 発生状況

対象URL:

```txt
/documents/delivery/4
```

ログイン後のPlaywright確認:

```txt
main document status: 500
content-type: text/html; charset=utf-8
body text:
  納品書: YD-002
  PDFをダウンロード
download link:
  delivery_YD-002.pdf
```

つまり、ページ全体が完全に描画不能ではなく、納品書本文とPDFダウンロードリンク生成までは到達している。

## 3. 500の発生箇所

Playwrightで全レスポンスを捕捉した結果:

```txt
500:
  http://localhost:3000/documents/delivery/4

200:
  /_next/static/chunks/app/documents/delivery/%5Bid%5D/page.js
```

ページ内の別APIやPDF blob URLではなく、メインドキュメント `/documents/delivery/4` 自体が500を返している。

HTML確認:

```txt
html id: __next_error__
meta name="next-error" content="not-found"
```

一方で、同じHTML内のReact Flight payloadには以下が含まれていた。

```txt
DeliveryPDFClient
deliveryNumber: YD-002
jobs:
  Y-010
  Y-009
```

このため、DB取得や納品書データ生成は成功しているが、Next App Routerの応答生成上は `not-found` / error HTML扱いが混ざっている状態と判断した。

## 4. 納品書ページのデータ取得導線

対象:

```txt
src/app/documents/delivery/[id]/page.tsx
```

導線:

```txt
DeliveryNote.findUnique(id)
  customer
  repairs
    watch
      brand
      model
      reference
    estimate
      items
        partsMaster.grade
        partsMaster.notes2
```

その後、以下の形へ変換している。

```txt
pdfData
  deliveryNumber
  date
  customer
  jobs
  taxRate
  shippingFee
```

表示:

```txt
<DeliveryPDFClient data={pdfData} />
```

PDFクライアント:

```txt
src/components/pdf/DeliveryPDFClient.tsx
```

内部で以下を使う。

```txt
usePDF({ document: <DeliveryDocument data={data} /> })
```

PDFドキュメント:

```txt
src/components/pdf/DeliveryDocument.tsx
```

内部で以下を使う。

```txt
@react-pdf/renderer
Font.register
Document / Page / Text / View
```

## 5. 本文表示とHTTP 500の差分

本文が見える理由:

```txt
React Flight payload内にDeliveryPDFClient用のdataが含まれている
クライアント側でPDFダウンロードリンクが生成されている
```

HTTP 500になる理由として見えていること:

```txt
メインHTMLが __next_error__ 扱い
meta next-error が not-found
notFound fallback HTMLが同じレスポンス内に含まれている
```

このため、以下のどちらかに近い状態と考えられる。

```txt
Next App Routerがこのページの応答をerror/not-found扱いにしている
サーバー応答生成時に例外またはnotFound扱いが混ざっているが、クライアント側chunkで一部描画できている
```

なお、同じ `documents` 配下の以下はログイン後200だった。

```txt
/documents/estimate/14
/documents/invoice/6
```

したがって、`documents` 配下全体の認証・ルーティング問題ではなく、納品書ページ固有の実装に寄っている。

## 6. RepairLineItem変更との関連有無

関連は低い。

納品書ページは現時点でRepairLineItemを参照していない。

確認した納品書データ取得元:

```txt
DeliveryNote
Repair
Estimate
EstimateItem
PartsMaster.grade / notes2
Customer
Watch
Brand / Model / Reference
```

RepairLineItemを表示元にしている箇所はない。

また、対象DeliveryNote.id=4の中身は、Task 107-24で新規作成したRepair.id=22ではなく既存Repairに紐づくデータである。

## 7. 原因

確定できたこと:

```txt
DeliveryNote.id=4 のDB取得は成功している
EstimateItem由来のjobs生成も成功している
DeliveryPDFClient用dataはHTML/RSC payloadに含まれている
500はページ内リソースではなくメインドキュメントで発生している
HTMLは __next_error__ / next-error=not-found 扱いになっている
```

推定原因:

```txt
納品書ページ固有のクライアントPDF生成実装、またはNext App Routerの応答生成との相性問題。
```

特に以下が候補。

```txt
src/app/documents/delivery/[id]/page.tsx
  -> server pageからDeliveryPDFClientを直接返している

src/components/pdf/DeliveryPDFClient.tsx
  -> usePDFでクライアントPDFを生成している

src/components/pdf/DeliveryDocument.tsx
  -> @react-pdf/renderer / Font.register を使うPDF document本体
```

ただし、明確なスタックトレースは取得できていないため、このTaskでは断定修正しない。

## 8. 修正した場合は変更内容

このTaskでは修正していない。

理由:

```txt
小さい修正で確実に直る原因までは特定できていない
納品書PDF生成方式に手を入れると帳票表示導線への影響がある
RepairLineItem二重書きとは別問題として切り分けるべき
```

## 9. 修正しなかった場合は理由

修正候補はあるが、影響範囲を確認してから別Taskで扱うのが安全。

候補:

```txt
DeliveryPDFClientをさらにdynamic import / ssr:false相当に切り出す
納品書も見積書・請求書と同じ保存済みPDF方式へ寄せる
DeliveryDocumentの@react-pdf/renderer依存をclient-only境界内へ閉じる
納品書ページのserver componentとPDF client componentを分離する
```

いずれも、納品書帳票表示の実装方針に関わるため、今回の調査Taskでは実施しない。

## 10. 確認コマンド結果

```txt
npx tsc --noEmit --pretty false --incremental false
# success

npx prisma validate
# success

git status --short
# 空
```

## 11. 次Task案

```txt
Task 107-26:
納品書 /documents/delivery/[id] のHTTP 500を、PDF client-only境界の整理で最小修正する。
```

修正候補:

```txt
DeliveryPDFClient / DeliveryDocument のclient-only境界を整理する
server pageはserializableなpdfData作成だけにする
@react-pdf/renderer依存がserver応答生成に混ざらないようにする
修正後、/documents/delivery/4 がHTTP 200になることをPlaywrightで確認する
```

別案:

```txt
Task 107-26:
納品書も保存済みPDF方式へ寄せるか、既存の即時PDF生成方式を維持するか設計する。
```

ただし、見積書・請求書のStorage接続問題とは別に扱う。

## 12. 変更しなかったもの

このTaskでは以下を変更していない。

```txt
schema
migration
seed
RepairEntryForm
PublicCase生成
RepairLineItem表示切替
見積表示の読み先
Supabase Storage
納品書ページ実装
PDFコンポーネント
```
