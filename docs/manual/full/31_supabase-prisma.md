# 第31章 Supabase / Prisma

## 31.1 業務データの正本

Customer、Inquiry、Repair、Shipment、画像やPDFの保存先を示すメタデータなど、業務データの正本はSupabase PostgreSQLにある。Railway上のNext.jsはこれを読み書きする実行環境であり、Railwayのインスタンス内のファイルを業務データの正本にはしない。

2026-10-05確認時点のproduction Supabase projectは`ACTIVE_HEALTHY`、regionは`ap-northeast-1`、PostgreSQL engineは17。これらは確認時点の状態であり、運用時の稼働状態は改めて確認する。

![SupabaseとR2のデータ保存境界](../assets/diagrams/supabase-r2-data-boundary.svg)

## 31.2 Prismaの接続と役割

Next.js server側の主な業務DBアクセスは`src/lib/prisma.ts`のPrisma Clientを通す。`prisma/schema.prisma`のdatasourceは`postgresql`であり、接続先は環境変数`DATABASE_URL`、`DIRECT_URL`、`SHADOW_DATABASE_URL`を参照する。接続文字列の値はこのマニュアルに記載しない。

`@supabase/supabase-js`が存在しても、全業務DBアクセスの主経路を意味しない。`src/lib/supabase-admin.ts`のserver-only admin clientは、主にSupabase Storageの`documents` bucketで利用する。browser向けの`src/lib/supabase-client.ts`もあるが、管理画面ログインやPrisma経由の業務DBアクセスと混同しない。

`prisma generate`はschemaからPrisma Clientを生成する処理であり、DB schemaを変更するmigrationではない。Railwayの`npm run build`にも含まれるが、それだけでproduction DBへmigrationは適用されない。

## 31.3 管理画面の認証

管理画面はNextAuth Credentialsでログインする。`Admin` tableのメールアドレスで管理者を探し、保存されたpassword hashをbcryptで検証し、JWT sessionを使う。管理画面のログイン基盤はSupabase Authではない。認証された画面やAPIがserver側でPrismaを呼ぶことと、browserからSupabase Data APIを利用することも別の経路である。

## 31.4 PDFと画像の保存境界

見積PDFと請求書PDFのbodyはSupabase Storageの`documents` bucketに保存する。PostgreSQL側は業務レコードと保存先を示す情報を扱う。問い合わせ画像とRepairPhotoのbodyはCloudflare R2に保存するため、「ファイルはすべてR2」とは扱わない。保存先の詳細は[第32章 Cloudflare R2](32_cloudflare-r2.md)を参照する。

| データ | 正本・保存先 | アプリからの主経路 |
| --- | --- | --- |
| 業務レコード、ファイルのmetadata / key / status | Supabase PostgreSQL | Next.js server → Prisma Client |
| 見積PDF・請求書PDFのbody | Supabase Storage `documents` | Next.js server → Supabase admin client |
| Inquiry画像・RepairPhotoのbody | Cloudflare R2 | Next.js server → 用途別R2 client |

## 31.5 RLS / GRANTとserver-only table

RLSは行へのアクセス制御、GRANTはData API roleのtable / sequence権限に関わる。両者を片方だけで判断しない。たとえば`PhysicalTag`、`StorageLocation`、`Shipment`と関連tableのmigrationには、RLSを有効化し、policyを設けず、Data API roleへの権限をrevokeするserver-only設計がある。アプリは認証済みのNext.js serverからPrismaでアクセスする。

2026-10-05確認時点のSecurity Advisorには`rls_enabled_no_policy`のINFOが16 tablesある。server-only tableについては意図的な設計が含まれるため、INFOを消す目的だけでpolicyやGRANTを追加しない。対象tableごとにmigration、実際の権限、利用経路を照合して判断する。

2026-10-30以降、新規`public` tableにData API用権限は自動付与されない。Data APIを利用する場合は、同じmigrationで`anon`、`authenticated`、`service_role`それぞれに必要な最小権限を用途に合わせて明示する。server-only tableなら不要なGRANTを付けない。schema、migration、RLS、GRANTの変更は高リスク変更として扱う。

## 31.6 migrationとdeployの分離

DB変更の正本はrepository内のmigration SQL。適用の考え方は、production backup → 独立review → migrationの明示適用 → DB構造・権限のread-backとSecurity Advisor確認 → アプリdeployとsmoke確認の順である。変更内容によって適切な適用順序と互換性を事前に確認する。

[第33章 Railway](33_railway.md)のbuild / startには`prisma migrate deploy`が入っていない。GitHub `main`へのpushやRailway deployだけでmigration済みと判断しない。逆にmigration適用結果も、アプリのbuild成功だけからは判断できない。

## 31.7 障害時に見る境界

DB接続エラーならRailway runtime logとSupabase側の稼働・接続状態を分けて確認する。schema mismatchが疑われる場合は、対象migration SQLとproductionへの適用状況を別途照合する。Storage上のPDF障害なら`documents`への操作、R2画像障害なら第32章の用途別経路を追う。接続文字列、key、token、署名URLを調査ログへ転記しない。
