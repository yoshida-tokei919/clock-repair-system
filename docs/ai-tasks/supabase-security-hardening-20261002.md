# Supabase security hardening — 2026-10-02

Status: production complete

## Purpose and implementation

Supabase Security AdvisorのFunction Search Path Mutable WARNを解消した。対象は次のzero-arg trigger functionの2つだけ。

- `public.set_invoice_gross_total_on_insert()`
- `public."preventInquiryMessageClassificationManualOverwrite"()`

Application/security commit: `957d675d210b42baeec7cfa37b0596ec825178c9` (`fix: pin trigger function search paths`)。Migration SQLは両functionに`SET search_path = '';`を指定する2文のみ。function body、table/data、RLS、GRANTの変更なし。

## Independent review and pre-production backup

- Production適用前に独立レビュー完了。productionで両functionがzero args、`RETURNS trigger`、`security_definer=false`、変更前`proconfig=null`であることを確認。
- Backup directory: `C:\Users\yoshi\clock-repair-backups\security-hardening-20261002-103738`
- Local Supabase CLI / `pg_dump`が利用できないため、read-only logical XML data + schema/security metadataをbackup fallbackとして取得。migration前の`public` base tablesは74件。
- `public-data-and-xsd.xml` — 383527 bytes — SHA256 `99A0E876D31DDF034F53554F6D384775872EC440F5998FB14D7552714342A414`
- `schema-metadata.json` — 380247 bytes — SHA256 `5DD8A4FD6E7F57F635DFE8A8CA9DBA3944FF5EF3D76751492529877B0190445D`
- Previous full SQL dump baseline: `C:\Users\yoshi\clock-repair-backups\task192a-20260928-013752`

## Production migration and verification

- Supabase migration: `20261002013945 harden_trigger_function_search_paths`。
- 適用後、両functionの`proconfig`に`search_path=""`を確認。両functionとも`security_definer=false`を維持。
- Supabase Security AdvisorのFunction Search Path Mutable WARN: 0件。
- 残るSecurity Advisor通知は`rls_enabled_no_policy`のINFO 13件のみ。以前のレビューで、anon / authenticated / service_roleにData API table privilegesを付与しないserver-only設計として意図的と確認済み。

## Deployment and smoke

- Railway deployment: `4df54bcf-ad0d-4ca6-9a4f-59f33edcf5d6` — `SUCCESS`。
- Source: GitHub `main`、commit `957d675d210b42baeec7cfa37b0596ec825178c9`。Region: `sin`。Next.js Ready in 607ms。
- Production smoke: `GET /` → 200、`GET /login` → 200、unauthenticated `GET /repairs` → 307。
- Production tag: `production-security-hardening-20261002`。

## Out-of-scope follow-up

Railway buildはNext.js 14.1.0のknown security vulnerability warningを出し、`npm audit`は21件（low 2、moderate 3、high 14、critical 2）を報告した。依存関係の修正は本Taskの対象外。別のdependency security audit / upgrade Taskで調査する。

Stage Bの次候補Task198Dは引き続きuser approval待ち。本security hardening完了はTask198D開始の承認ではない。
