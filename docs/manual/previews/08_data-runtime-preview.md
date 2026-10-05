# データ保存・production実行環境編 印刷見本

版: 0.1

作成日: 2026-10-05

対象: 詳細版 [第31章 Supabase / Prisma](../full/31_supabase-prisma.md)、[第32章 Cloudflare R2](../full/32_cloudflare-r2.md)、[第33章 Railway](../full/33_railway.md)。A4縦カラー、全6ページ想定。画面スクリーンショットは使わず、共通SVGと表で構成する。

## 1ページ目 — データ正本とstorage境界

**見出し:** 業務の正本、PDF、画像は保存先が異なる。

<img src="../assets/diagrams/supabase-r2-data-boundary.svg" alt="Supabase PostgreSQL、Supabase Storage、R2へのデータ保存境界" style="display:block;width:165mm;max-width:100%;margin:0 auto;" />

**図下の要点:** PostgreSQLは業務レコードとファイルのmetadata / keyを保持し、`uploadStatus`（`PENDING` / `STORED` / `FAILED`）は`InquiryFile`だけにある。object storageはbinary bodyを保持する。管理画面認証はNextAuth + Admin tableで、Supabase Authではない。

**組版:** 図幅165mm。DB正本を緑、アプリを青、R2を橙に統一する。小さい文字が読める縮尺を優先する。

<div style="page-break-before: always;"></div>

## 2ページ目 — Prisma / Supabase DBとmigration

**見出し:** buildのClient生成とproduction DB変更を分けて読む。

| 項目 | 現行の境界 |
| --- | --- |
| 業務DB正本 | Supabase PostgreSQL。Next.js server側は主にPrisma Clientでアクセス |
| Prisma datasource | PostgreSQL。接続は`DATABASE_URL` / `DIRECT_URL` / `SHADOW_DATABASE_URL`の環境変数名で参照 |
| `prisma generate` | Client生成。schema migrationではない |
| server-only table | RLS enabled、policyなし、Data API role権限をrevokeする設計例がある |
| Security Advisor | 2026-10-05時点の`rls_enabled_no_policy` INFO 16 tablesは、設計・権限・経路を個別照合する |
| migration | repoのmigration SQLを正本に、backup → 独立review → 明示適用 → read-back / Security Advisor → app deploy / smoke |

**注意枠:** INFOを消すためだけにpolicyやGRANTを付けない。2026-10-30以降の新規public tableは、Data APIが必要な場合だけ同一migrationで最小GRANTを明示する。

<div style="page-break-before: always;"></div>

## 3ページ目 — R2 Inquiry画像の流れ

**見出し:** 画像を正規表示できるのは`STORED`になってから。

```text
LINE content API → 20 MiB上限 → rotate → 3000×3000以内へ縮小
                 → WebP q85 → R2保存 → InquiryFile: STORED
```

| 保存・閲覧 | 現行の扱い |
| --- | --- |
| object key形式 | `inquiries/YYYYMM/uuid.webp` |
| cache | `private, max-age=0` |
| DB status | `PENDING` → 成功時`STORED`、失敗時`FAILED` |
| 管理画面の閲覧 | NextAuth認証済みsame-origin routeから300秒のsigned URLへredirect |

**注意枠:** signed URL、raw key、credentialは印刷・ログ転記しない。`PENDING`や`FAILED`は正規表示対象ではない。

<div style="page-break-before: always;"></div>

## 4ページ目 — 写真とPDFの棲み分け

**見出し:** 写真のR2経路と文書のSupabase Storage経路を混同しない。

| 種別 | bodyの保存先 | 要点 |
| --- | --- | --- |
| RepairPhoto | R2写真用設定 | JPEG / PNG / WebP。`repairs/{repairId}/YYYYMM/{uuid}.{ext}` |
| PublicCaseへcopyした写真 | R2写真用設定 | `public-cases/{publicCaseId}/...`へ別objectを作る |
| 見積PDF・請求書PDF | Supabase Storage `documents` | R2には保存しない |

**下段の処理図:** `R2 object作成 → RepairPhoto DB metadata作成`。DB保存失敗時はR2 delete rollbackを試みる。写真のsigned read URLは既定300秒。

**組版:** 上段の表と下段の2段処理図を分け、失敗時の矢印を琥珀色で示す。

<div style="page-break-before: always;"></div>

## 5ページ目 — Railway deployとDB migration

**見出し:** GitHub mainからのdeployは、DB migration適用を意味しない。

<img src="../assets/diagrams/railway-deploy-flow.svg" alt="Railwayのbuildと明示的なproduction DB migrationの別レーン" style="display:block;width:175mm;max-width:100%;margin:0 auto;" />

**図下の要点:** Railpackの`npm install → npm run build → npm run start`でアプリを起動する。buildは`prisma generate && next build`。2026-10-05確認時点は`sin`の1 replica、volumeなし、最新deploymentは`SUCCESS`。statusは運用時に再確認する。

<div style="page-break-before: always;"></div>

## 6ページ目 — 障害切り分けと変更時チェック

**見出し:** エラーの発生場所と正本の保存先を先に特定する。

| 症状・変更 | 確認順 |
| --- | --- |
| deploy失敗 | deployment status → build log → runtime / deploy log → app smoke |
| DB schema mismatch疑い | migration SQLとproduction適用状況を別確認。build成功を適用証拠にしない |
| Inquiry画像が見えない | source message → `InquiryFile.uploadStatus` → R2保存 → 認証済みread route |
| RepairPhotoが見えない | R2 object作成 → DB metadata → rollback結果 → read route |
| PDFが見えない | Supabase Storage `documents`の経路を確認 |
| DB変更 | backup → 独立review → 明示適用 → read-back / Security Advisor → app deploy / smoke |

**注意枠:** Railway rollback / redeployはDB migrationを自動で巻き戻さない。secret、接続値、signed URL、顧客情報を調査記録へ載せない。
