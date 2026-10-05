# 第38章 バックアップ・migration・deploy

## 38.1 production変更の基本順

コード変更を伴うTaskは**1 Task = 1 commit**とし、開始時とcommit前に差分を確認してTask外の変更を混ぜない。基本順は次のとおり。productionへの操作は各Taskの対象・リスク・互換性に応じて具体化する。

![production変更の安全フロー](../assets/diagrams/production-change-safety-flow.svg)

1. Task境界に沿って実装し、型・関連test・build等のlocal自動確認と差分確認を行う。
2. 対象差分だけをcommitする。migration SQLがある場合はrepository内のそのSQLを変更の正本とする。
3. migration・environment設定の差分、対象production DB、既存アプリと新アプリの互換性、必要権限を確認する。
4. 変更リスクに応じてproduction変更前のbackupを取得し、独立reviewとユーザーの明示承認を経る。特にschema／migration／RLS／GRANT／auth／決済／production DBなどの高リスク変更は、実装担当とレビュー担当を分ける。
5. 必要なmigrationを**明示的に**適用し、構造・権限をread-backする。必要ならSecurity Advisorも確認する。適用とdeployの順序は変更の互換性を事前に確かめる。
6. GitHub `main`からRailwayへdeployし、build結果、runtime起動、Taskに応じたsmokeを別々に確認する。
7. production commit、deployment、backup、migration、smoke、tagをTask記録へ残す。deploy成功時はproduction tagを作る。

docs-onlyとinvestigation-onlyはproduction反映の例外であり、**`Production: pending`**と明記する。コード変更Taskをcommitだけで完了扱いにしない。独立reviewや自動確認の成功もproduction操作の自動承認ではない。[実装ルール](../../ai/04_IMPLEMENTATION_RULES.md)参照。

## 38.2 Railway deployとDB migrationは別レーン

現行Railwayのdeploy sourceはGitHub `main`である。`package.json`のbuildは`prisma generate && next build`、startは`next start`。`prisma generate`はPrisma Clientを生成するだけでDB schemaを変更しない。build/startに`prisma migrate deploy`は含まれない。したがってGit push、Railway deploy、build成功のいずれも、production DBへmigrationが適用済みである証拠にはならない。[第31章](31_supabase-prisma.md)・[第33章](33_railway.md)参照。

Railwayのrollback／redeployはアプリの変更手段であり、適用済みDB migrationを自動で巻き戻さない。旧アプリへ戻す可能性を含め、列・制約・権限の互換性と復旧方法をproduction操作前に確認する。`prisma migrate dev`や`db push`をproductionの一般手順にはしない。

## 38.3 migration・RLS・GRANTの確認

適用前にrepo内のmigration SQL、対象DB、未適用・既適用の差分、既存データとの互換性、実行roleと必要権限を照合する。高リスク変更は独立reviewを受け、本番操作前にユーザーの明示承認を得る。migration後はtable／列／index／functionなど変更対象の構造と、RLS／policy／GRANT／sequence権限を必要範囲でread-backする。Security Advisorの警告も必要に応じて確認し、`rls_enabled_no_policy`のINFOを消す目的だけでserver-only tableにpolicyやGRANTを追加しない。

2026-10-30以降に新規`public` tableを作るとき、Data APIから利用するなら同じmigrationで`anon`／`authenticated`／`service_role`の用途別に**最小限のGRANT**を明示する。server-onlyなら不要なData API GRANTを付けない。RLSとGRANTは両方を確認する。[第31章](31_supabase-prisma.md)参照。

## 38.4 backupの対象と限界

backupはproduction変更のリスクに応じて**変更前**に取得する。migrationがあるTaskでは原則必須。DBだけでなく、影響する保存先や復旧単位も確認する。取得時刻、対象、保存先、形式、取得の成否、復元可能性と限界をTask記録に残す。固定の万能コマンドや、取得しただけで復元できるという前提は置かない。特にschema・security metadata・data・Storage／R2 object bodyは同一物ではない。

2026-10-02のSupabase security hardeningでは、local Supabase CLI／`pg_dump`が使えなかったため、read-onlyの**logical XML data + schema/security metadata fallback**を取得し、以前のfull SQL dump baselineも保持していた。このfallbackを標準の完全backupとは呼ばない。復元手順・対象範囲・整合性には限界があるため、production操作前にその変更を戻せるか別途確認する。[当該Task記録](../../ai-tasks/supabase-security-hardening-20261002.md)参照。

## 38.5 deploy後のsmokeと記録

smokeはTaskに応じ、公開route、管理画面の未認証redirect、保護APIの`401`、変更対象APIの安全な応答などを確認する。Railway buildの成功、runtime起動、HTTP応答、DB read-backは別の確認結果として残す。実顧客へのLINE送信、決済、Shipment作成、DB破壊操作などの不可逆な操作を、許可なくsmokeとして実行しない。Next.js 15 security migrationでは公開routeの`200`、保護画面の`307`、保護APIの`401`、runtime logを確認し、schema／migration変更はなかった。[当該Task記録](../../ai-tasks/next15-security-migration-20261002.md)参照。

Task記録には少なくとも、production source commit、Railway deploymentと結果、適用migrationとread-back、backupの保存先・時刻・対象・限界、smokeの対象と結果、未確認事項、production tagを残す。migrationやbackupが不要なTaskでも「なし」と判断根拠を記録する。現在のproduction commitやdeployment IDは変わるため、過去のIDを恒久手順として使わず、操作時点の実状態を確認する。secret、token、cookie、顧客PII、接続文字列の実値は記録しない。
