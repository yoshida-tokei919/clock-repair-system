# 111 ローカルログイン失敗の調査と復旧

## 目的

ローカル開発環境で `admin@yoshida-watch.com` によるログインが失敗し、画面に「メールアドレスまたはパスワードが正しくありません」と表示される原因を、Phase 2 部品Web検索実装とは切り分けて調査する。

## 調査対象

- `src/lib/auth.ts`
- `src/app/login/page.tsx`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/middleware.ts`
- `prisma/schema.prisma` の `Admin` model
- `prisma/seed.ts` の Admin 作成処理
- `.env` / `.env.local` のDB/NextAuth関連設定
- ローカルDB接続状態
- 110系未コミット差分の認証影響

## 結論

直接原因は、ローカルDB上の `admin@yoshida-watch.com` の `passwordHash` がbcrypt形式ではない値だったこと。

現行 `src/lib/auth.ts` は `Admin` を email で検索し、`bcrypt.compare(credentials.password, admin.passwordHash)` で検証する。そのため、Adminレコードが存在していても、bcrypt形式ではない `passwordHash` では必ず認証失敗になる。

また調査開始時点では Docker Desktop が起動しておらず、`.env.local` が指す `localhost:54322/clock_repair_local` に接続できなかった。Docker Desktop起動後、既存の Supabase ローカルDBコンテナが起動し、DB確認が可能になった。

## 接続先DB

`.env.local` / `.env` の `DATABASE_URL` はローカルPostgreSQLを指していた。

- host: `localhost`
- port: `54322`
- database: `clock_repair_local`
- schema: `public`

秘密情報を含むため、接続文字列全文は記録しない。

## Admin確認

対象 email の Admin レコードは存在した。

確認内容:

- email: `admin@yoshida-watch.com`
- role: `admin`
- hash形式: bcryptではない値

passwordHash本体は記録しない。

## 復旧内容

既存のローカルAdmin復旧スクリプトと同じ方針で、対象Admin 1件の `passwordHash` のみをbcrypt形式へ更新した。

更新対象:

- `Admin.passwordHash` のみ

更新しないもの:

- `Repair`
- `Customer`
- `PartsMaster`
- `RepairLineItem`
- `PricingRule`
- `PublicCase`
- その他業務データ
- 認証コード
- Prisma schema
- migration

## 確認結果

- bcrypt比較: 成功
- `npm run dev`: `http://localhost:3000` で起動成功
- Playwrightによるログイン: 成功
- `/repairs` 到達: 成功
- ログインエラー表示: なし

## 110系差分への影響

認証関連ファイルへの110系差分はなく、今回の部品Web検索実装がログイン失敗を直接起こした形ではなかった。

110系差分はrevertしていない。

## 注意

`prisma/seed.ts` のAdmin初期値にはbcryptではないダミー値が残っている。将来、ローカルDBをseedから再作成する場合は同じログイン失敗が再発する可能性がある。

ただし今回のTaskではDB resetは禁止であり、既存業務データを守るため、seed全体の変更や再投入は行っていない。
