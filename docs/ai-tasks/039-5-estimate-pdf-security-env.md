# 見積PDF Security / env運用

## service role key

`SUPABASE_SERVICE_ROLE_KEY` はserver専用。

絶対禁止:

```txt
NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
```

理由:

- `NEXT_PUBLIC_` はclient bundleに含まれる可能性がある
- service role keyはSupabaseの強い権限を持つ
- ブラウザに出るとStorage/DBへの不正アクセスにつながる

## env運用

`.env.local` に置く想定:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

注意:

- service role keyはチャットに貼らない
- `.env.local` はcommitしない
- `.env` / `.env.local` をAIが勝手に編集しない
- 本番環境の値とローカル環境の値を混同しない

## Supabase bucket

bucket:

```txt
documents
```

方針:

- private bucket
- public bucketにしない
- public URLは返さない
- route側で認証/token検証してからPDFを返す

## 認証 / token検証

管理者route:

- NextAuth session
- `getServerSession(authOptions)`
- 未ログインは401

B2B共有route:

- ログイン不要
- `EstimateDocument.publicToken`または`Repair.publicToken`
- tokenから許可された見積PDFだけを返す

LINE送信:

- 管理者操作から呼ぶ
- `EstimateDocument.currentPdfFileId` と `EstimatePdfFile.storageKey/status` を確認する
- `currentPdfFileId` または `storageKey` がない場合は送信停止
- LINEにはB2B共有ページURLのみを送る
- LINE送信時にPDFを生成しない
- LINE送信時にPDFをローカル保存しない
- LINEでPDF添付はしない
- 今後もLINEでPDF添付はしない
- PDF確認は共有ページ内のPDFボタンから行う

請求書LINE送信:

- 請求書は見積書と同じく、LINEで共有URLだけを送る
- LINEで請求書PDFを添付しない
- LINE本文に請求金額は書かない
- 支払期限も現時点では本文に必須ではない
- メールアドレスがない取引先も多いため、メール必須にはしない
- `{請求書共有URL}` は `https://` から始まる完全URLにする
- LINE上で自動的にクリック可能なURLにする
- URL先で請求書PDFを確認・ダウンロードできるようにする

## server-onlyを使う理由

`src/lib/supabase-admin.ts` と `src/lib/estimate-pdf-storage.ts` はserver専用。

`server-only` を使う理由:

- service role keyをclient bundleに混ぜない
- browserから直接Storage操作させない
- PDF binary upload/downloadをserver側に閉じる

## 写真用Storage helperとPDF用helperを分ける理由

既存の写真用helper:

```txt
src/lib/supabase-storage.ts
bucket: repair-photos
public表示前提
anon client前提
```

見積PDF用helper:

```txt
src/lib/supabase-admin.ts
src/lib/estimate-pdf-storage.ts
bucket: documents
private bucket
service role key
server-only
PDF binary upload/download
```

分ける理由:

- public photoとprivate documentは権限モデルが違う
- service role keyを写真表示のclient helperに混ぜない
- PDFはroute側で認証/token検証して返す必要がある
- public URLを直接返してはいけない

## やってはいけないこと

- service role keyをclient側に出す
- `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`を使う
- `documents` bucketをpublicにする
- PDFのpublic URLを返す
- PDFのsigned URLを返す
- B2B共有画面アクセス時にPDFを自動生成する
- LINE送信時にPDFを生成する
- LINE送信時にPDFをローカル保存する
- LINEでPDF添付する
- 請求書LINE本文に請求金額を書く
- 請求書PDFをLINE添付する
- 請求書共有URLを相対URLのまま送る
- 取引先が未確認PDFを見られる状態にする
- 本番DB / Supabase / Railway DBを確認なしに触る
