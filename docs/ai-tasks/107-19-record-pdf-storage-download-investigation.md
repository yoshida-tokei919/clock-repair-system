# Task 107-19: 見積書・請求書PDF download failed 調査結果の記録

## 目的

RepairLineItem（案件明細）二重書き実装後の確認中に、見積書・請求書PDFで download failed が発生した。

調査の結果、RepairLineItem変更による不具合ではなく、ローカル環境からSupabase Storageへ到達できない環境問題であることが分かった。

このメモでは、その調査結果を記録する。

## 発生していたエラー

見積書:

```txt
{"ok":false,"error":"PDF download failed"}
```

請求書:

```txt
{"ok":false,"error":"Invoice PDF download failed"}
```

納品書:

```txt
正常表示
```

## エラー文の発生箇所

見積書:

```txt
src/app/api/documents/estimate/[id]/pdf/route.ts
```

`downloadEstimatePdf(...)` 失敗時に以下を返す。

```txt
{"ok":false,"error":"PDF download failed"}
```

請求書:

```txt
src/app/api/invoices/[id]/pdf/route.ts
```

`downloadInvoicePdf(...)` 失敗時に以下を返す。

```txt
{"ok":false,"error":"Invoice PDF download failed"}
```

## 原因

見積書・請求書PDFは、DBに保存された `storageKey` を使って Supabase Storage の `documents` bucket からPDFをdownloadする実装になっている。

現在のローカル環境では `SUPABASE_URL` のDNS解決自体が失敗しており、Storage download が `fetch failed` になっている。

したがって原因は、PDFファイル欠損ではなく、Supabase Storage接続先へ到達できない環境問題である。

## 納品書だけ正常な理由

納品書は保存済みPDFをSupabase Storageからdownloadする方式ではない。

納品書画面は、DB上の納品書 / Repair / EstimateItem を読み、画面側でPDF表示している。

そのため、今回のStorage download失敗の影響を受けない。

## download route 差分

見積書:

```txt
src/app/api/documents/estimate/[id]/pdf/route.ts
```

- `EstimateDocument.currentPdfFileId` を見る
- `EstimatePdfFile.storageKey` を取得する
- `downloadEstimatePdf(storageKey)` で Supabase Storage から取得する
- bucket は `documents`

請求書:

```txt
src/app/api/invoices/[id]/pdf/route.ts
```

- `Invoice.currentPdfFileId` を見る
- `InvoicePdfFile.storageKey` を取得する
- `downloadInvoicePdf(storageKey)` で Supabase Storage から取得する
- bucket は `documents`

納品書:

```txt
src/app/documents/delivery/[id]/page.tsx
```

- `DeliveryNote` と紐づく Repair / EstimateItem を読む
- `DeliveryPDFClient` へデータを渡す
- 保存済みPDFをStorageからdownloadしない

## DBメタデータ

### 見積書 YE-010

```txt
EstimateDocument.id: 14
currentPdfFileId: 12
storageKey: estimates/14/12.pdf
fileName: estimate_YE-010.pdf
fileSize: 82586
status: current
```

### 請求書 YI-003

```txt
Invoice.id: 6
currentPdfFileId: 6
storageKey: invoices/6/6.pdf
fileName: invoice_YI-003.pdf
fileSize: 75093
status: current
```

### 納品書 YD-002

```txt
DeliveryNote.id: 4
DBレコードあり。
Storage PDFメタデータ方式ではないため、今回のStorage download失敗の影響なし。
```

## Storage path 存在確認

対象:

```txt
estimates/14/12.pdf
invoices/6/6.pdf
```

結果:

```txt
Storage download failed: fetch failed
```

さらに `SUPABASE_URL` へのHTTP疎通確認で、以下のDNS解決エラーを確認した。

```txt
The remote name could not be resolved: 'vpyjonjfpkpbvvjufbiu.supabase.co'
```

このため、現時点では「Storage上にファイルが存在しない」ことを示す結果ではなく、「Supabase Storage接続先へ到達できない」ことを示す結果として扱う。

## RepairLineItem変更との関係

関連は低い。

直近のRepairLineItem関連変更は、Repair更新APIに二重書きを追加しただけであり、以下には触れていない。

```txt
PDF download route
PDF generate route
Supabase Storage download処理
帳票PDF表示処理
```

直近commit `867ca6d feat: dual write repair line items on repair update` の変更対象は以下のみ。

```txt
src/app/api/repairs/[id]/route.ts
```

## 確認結果

```txt
npx tsc --noEmit --pretty false --incremental false
# success

npx prisma validate
# success

git status --short
# 空
```

## 今後の扱い

この問題は、現時点ではコード修正よりもローカル環境のSupabase接続問題として扱う。

RepairLineItem（案件明細）二重書きの検証は継続可能。

ただし、保存済みPDFの表示確認を続けるには、ローカル環境からSupabase Storageへ到達できる状態にする必要がある。

## 次Task案

```txt
Task 107-20:
ローカル環境の SUPABASE_URL / Storage接続先確認、
またはローカルStorage利用方針の整理
```

確認する候補:

```txt
ローカルPCのDNS / ネットワーク状態
SUPABASE_URL の正当性
Supabase project URL への到達可否
保存済みPDFをローカルStorageへ退避する必要があるか
見積書・請求書も納品書同様に再生成表示できるfallbackを持つべきか
```

## 変更しなかったもの

このTaskでは以下を変更していない。

```txt
コード
schema
DB
migration
seed
Storageファイル
PDF生成処理
LINE送信処理
PublicCase生成処理
```
