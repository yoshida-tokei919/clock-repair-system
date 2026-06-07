# Task 107-26: 納品書 /documents/delivery/[id] HTTP 500 最小修正

## 1. 概要

Task 107-25で確認した `/documents/delivery/4` のHTTP 500を、納品書ページ固有のPDF client-only境界問題として最小修正した。

対象帳票:

```txt
DeliveryNote.id: 4
slipNumber: YD-002
URL: /documents/delivery/4
```

## 2. 原因

納品書ページは、見積書・請求書と違い、保存済みPDFをiframe表示する方式ではなく、server pageから `DeliveryPDFClient` を直接返していた。

```txt
src/app/documents/delivery/[id]/page.tsx
  -> DeliveryPDFClient
     -> usePDF
     -> DeliveryDocument
     -> @react-pdf/renderer
```

その結果、Next App Routerの初期応答生成時に、`@react-pdf/renderer` を使うclient-only PDF生成処理が納品書ページのRSC/HTML生成と混ざり、本文データはpayloadに含まれる一方で、メインドキュメントが `__next_error__` / `next-error=not-found` 扱いになっていた。

RepairLineItemは納品書表示導線で参照していないため、今回のHTTP 500とは無関係。

## 3. 修正内容

`DeliveryPDFClient` を直接server pageから返さず、`next/dynamic` の `ssr: false` を使うclient loaderを追加した。

```txt
server page
  -> DeliveryPDFClientLoader
     -> dynamic import DeliveryPDFClient ssr:false
        -> usePDF / @react-pdf/renderer
```

これにより、納品書ページのserver responseではPDF client処理を実行せず、ブラウザ側でのみPDF生成・iframe表示する。

## 4. 変更ファイル

```txt
src/app/documents/delivery/[id]/page.tsx
src/components/pdf/DeliveryPDFClientLoader.tsx
docs/ai-tasks/107-26-fix-delivery-document-500.md
```

変更していないもの:

```txt
RepairLineItem関連コード
src/lib/repair-line-items.ts
Repair保存API
RepairEntryForm
EstimateItem保存処理
PublicCase生成
prisma/schema.prisma
migration
db push
seed
見積書・請求書Storage処理
Supabase Storageファイル
```

## 5. RepairLineItemとの関連有無

関連なし。

納品書ページは引き続き以下を参照している。

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

RepairLineItemは表示元にしていない。

## 6. 確認結果

修正後、NextAuth検証用セッションCookieを使ってローカルの `/documents/delivery/4` を確認した。

```txt
STATUS=200
HAS_NEXT_ERROR=false
HAS_YD_002=true
```

Playwrightでも確認した。

```txt
STATUS=200
URL=http://localhost:3000/documents/delivery/4
BODY_HAS_YD_002=true
DOWNLOAD_ATTR=delivery_YD-002.pdf
IFRAME_COUNT=1
```

見積書・請求書のメインドキュメントも副作用確認した。

```txt
/documents/estimate/14 STATUS=200
/documents/invoice/6 STATUS=200
/documents/delivery/4 STATUS=200
```

## 7. 残課題

納品書は現時点では即時PDF生成方式のまま。

将来的には、見積書・請求書と同じく保存済みPDF方式へ寄せるか、即時PDF生成方式を維持するかを別Taskで設計する。

ただし、保存済みPDF方式へ寄せる場合は、帳票の過去表示固定方針との整合を先に確認する。

## 8. 確認コマンド

```txt
npx tsc --noEmit --pretty false --incremental false
# success

npx prisma validate
# success
```

## 9. git status

```txt
 M src/app/documents/delivery/[id]/page.tsx
?? docs/ai-tasks/107-26-fix-delivery-document-500.md
?? src/components/pdf/DeliveryPDFClientLoader.tsx
```
