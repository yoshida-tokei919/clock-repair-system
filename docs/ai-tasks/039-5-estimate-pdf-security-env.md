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
- `currentPdfFile`がない場合は送信停止
- LINEには共有URLを送る方針でよい

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
- B2B共有画面アクセス時にPDFを自動生成する
- 取引先が未確認PDFを見られる状態にする
- 本番DB / Supabase / Railway DBを確認なしに触る
