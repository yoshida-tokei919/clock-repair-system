# 見積PDF保存・共有基盤プロジェクト

## 目的

管理画面で確認した見積PDFと、取引先がB2B共有画面で見るPDFを同一ファイルにする。

このプロジェクトでは、PDF差異、列欠落、文字化け、敬称差異を防ぐ。B2B共有画面ではログイン不要を維持するが、public用に別PDFを生成しない。LINE送信時も、同じ保存済みPDFを前提にする。

## 背景

旧状態では、管理画面PDFとpublic PDF / LINE送信用PDFで生成経路が分かれていた。

```txt
管理画面PDF:
EstimateDocument.tsx

public PDF / LINE送信用PDF:
EstimateServerDocument.ts
```

このため、管理画面PDFにはある以下の列見出しが、public PDFでは消える差異が発生した。

- No.
- 管理No
- 貴社管理No
- 顧客名
- 時計情報
- 作業明細・交換部品 / 単価
- 小計(税抜)

## 最終方針

最重要方針:

```txt
ログイン不要 = 別PDFを作る、ではない
同じPDFを、認証方法だけ変えて見せる
```

最終形:

```txt
管理画面PDF = B2B共有画面PDF = LINE送信用PDF = 同じSupabase Storage上の保存済みPDFファイル
```

採用方針:

- Supabase Storage private bucket: `documents`
- storageKey: `estimates/{estimateDocumentId}/{pdfFileId}.pdf`
- DB: `EstimatePdfFile`
- `EstimateDocument.currentPdfFileId` で現在提示中PDFを指す

参照経路:

```txt
EstimateDocument.currentPdfFileId
→ EstimatePdfFile.storageKey
→ Supabase Storage documents bucket
```

## 完了済みcommit

- `75950fd Improve B2B shared repair card header layout`
- `ecaee3a Add estimate PDF file schema`
- `b20d4b3 Add estimate PDF storage helpers`
- `a549524 Add estimate PDF generation storage API`
- `e1f8bff Add admin estimate PDF retrieval API`
- `ec4fb7c Show saved estimate PDF in admin page`
- `f4b33ec Serve saved estimate PDF from public route`
- `8e75b2d Require saved estimate PDF before LINE sharing`

詳細は [039-1-estimate-pdf-change-log.md](./039-1-estimate-pdf-change-log.md) を参照。

## 現在の状態

完了済み:

- `EstimatePdfFile` model追加済み
- `EstimateDocument.currentPdfFileId` 追加済み
- Supabase Storage helper追加済み
- PDF生成・Supabase保存API追加済み
- 管理者用の保存済みPDF取得route追加済み
- 管理画面で保存済みPDF表示済み
- public PDF routeは保存済みPDF返却へ切替済み
- LINE送信は保存済みPDFの存在確認を前提に変更済み
- LINE送信時のPDF生成・ローカル保存は廃止済み
- ローカル動作確認済み

現在の完成状態:

```txt
管理画面PDF:
保存済みPDFを表示

B2B共有PDF:
/customer/repairs/[token]/estimate.pdf のURLを維持し、保存済みPDFを返す

LINE:
保存済みPDFの存在を確認したうえで、B2B共有ページURLのみ送信
PDFは添付しない
```

ローカル動作確認:

```txt
.env.local に SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定済み
Supabase Storage private bucket documents を作成済み
EstimateDocument.id = 13 でPDF生成API成功済み
Storage: documents/estimates/13/3.pdf
fileSize: 78876 bytes
EstimateDocument.currentPdfFileId = 3
EstimatePdfFile.id = 3
status = current
version = 3
id = 1, id = 2 は失敗テスト分で status = void
```

## 残タスク

- 実URLでB2B共有PDFボタンを確認する
- LINE送信APIの実送信テストを必要に応じて行う
- PDF未生成時のUI
- PDF未生成時の管理画面UI/共有画面UIをさらに整える
- 必要ならPDF再生成導線を既存見積書生成フローとどう接続するか検討する
- 旧PDF / `void` / `superseded` の管理UI
- PDFが古いかどうかの判定
- `EstimateServerDocument.ts` と `EstimateDocument.tsx` の整理

## 補助ドキュメント一覧

- [039-1-estimate-pdf-change-log.md](./039-1-estimate-pdf-change-log.md): commitごとの変更履歴
- [039-2-estimate-pdf-routes-and-flows.md](./039-2-estimate-pdf-routes-and-flows.md): routeとPDF生成/取得flow
- [039-3-estimate-pdf-db-storage-spec.md](./039-3-estimate-pdf-db-storage-spec.md): DB / Storage設計
- [039-4-b2b-shared-page-spec.md](./039-4-b2b-shared-page-spec.md): B2B共有画面仕様
- [039-5-estimate-pdf-security-env.md](./039-5-estimate-pdf-security-env.md): security / env運用
- [039-6-estimate-pdf-roadmap.md](./039-6-estimate-pdf-roadmap.md): 今後の実装roadmap

## 直近完了したTask

### public PDF route切替

commit:

```txt
f4b33ec Serve saved estimate PDF from public route
```

内容:

- `/customer/repairs/[token]/estimate.pdf` はURLを維持
- token検証は維持
- PDFをroute内で都度生成しない
- `EstimateDocument.currentPdfFileId → EstimatePdfFile.storageKey → Supabase Storage documents bucket` から保存済みPDFを取得して返す
- 保存済みPDFがない場合は `PDF not generated`
- 取引先アクセス時にPDFを自動生成しない
- public URL / signed URL は返さない

### LINE送信ルール変更

commit:

```txt
8e75b2d Require saved estimate PDF before LINE sharing
```

内容:

- LINE送信前に `EstimateDocument.currentPdfFileId` と `EstimatePdfFile.storageKey/status` を確認
- `currentPdfFileId` または `storageKey` が無い場合は送信停止
- LINE送信時にPDFを生成しない
- LINE送信時にPDFをローカル保存しない
- LINE送信時に別PDFを作らない
- LINEでPDF添付はしない
- 今後もLINEでPDF添付はしない
- LINEではB2B共有ページURLのみを送る
- PDF確認は共有ページ内のPDFボタンから行う
- `savedFilePath` はレスポンスから削除済み
- `EstimateServerDocument`, `renderToStream`, `fs`, Google Drive保存パスなどはLINE routeから削除済み

## 絶対方針

- public PDF用に別PDFコンポーネントを作らない
- 共有画面アクセス時にPDFを都度生成しない
- 取引先アクセス時に未確認PDFを自動生成しない
- 管理画面で確認したPDFと共有PDFは同じstorageKeyを参照する
- LINE送信時にPDFを生成しない
- LINE送信時にPDFをローカル保存しない
- LINEでPDF添付しない
- LINEではB2B共有ページURLのみを送る
- service role keyはclient側に出さない
- `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` は絶対に使わない
- Supabase bucketはprivate
- public URLは返さない
- 1スレッド1タスク
- 1Taskごとにcommit
- `git add .` 禁止
- `.next-dev.err.log` は触らない
- `.env` / `.env.local` は触らない
- 本番DB / Supabase / Railway DB は触らない
- 既存のPDF routeやLINE送信を一気に変更しない
- 不明点があれば実装前に質問
