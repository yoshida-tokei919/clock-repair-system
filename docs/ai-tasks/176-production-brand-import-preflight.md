# Task176: production Brand import preflight

## Scope and status

Task176 は docs-only の production Brand / BrandAlias import 事前確認。DB write、seed apply、migration、deploy、push、tag、追加 backup、既存ファイルの変更は行わない。コード、schema、canonical data の変更もない。production への書き込みは、空テーブルへの追加を見込む場合でも高リスクとして扱う。Codex は commit せず、Task記録はオーケストレータが 1 Task = 1 commit で閉じる。

**Production: pending / backup complete / literal dry-run complete / apply not executed.**

## Git and production baseline

- Task176 文書作成前の local `HEAD`: `0a35be9 chore: guard production brand seed apply`。
- `origin/main`: `c674be7 feat: add related repair case links`。local `main` は 3 commits ahead で、Task176 文書作成前の作業ツリーは clean。
- `stash@{0} accidental-copilot-task3-20260924` は untouched。
- Supabase project: `vpyjonjfpkpbvvjufbiu`、region `ap-northeast-1`、`ACTIVE_HEALTHY`、PostgreSQL `17.6.1`。
- 2026-09-24 07:53:39.460799+00 の read-only SQL で `Brand=0`、`BrandAlias=0`、duplicate `normalizedAlias` row が存在しないことを確認。
- Railway production project: `a5241b0d-4326-49ba-9e83-ff3221584121`。
- Environment: `dd36d737-64a9-4e12-9c09-5a1dc6dc505f`。
- Service: `aac9dbdd-ddd0-4c09-a1b2-816f27271d81` (`clock-repair-system`)。
- Production deployment: `8d697214-0a13-4246-bfcb-130643a2f8a2`。Production commit: `c674be7c0d70e697bda787d9c28dc35e6c928240`。Deployment `SUCCESS`、instance `RUNNING`。

## Fresh backup before any production Brand write

- Archive: `C:\Users\yoshi\clock-repair-backups\20260924\production-pre-task176-brand-import-20260924-165553.dump`
- Manifest: `C:\Users\yoshi\clock-repair-backups\20260924\production-pre-task176-brand-import-20260924-165553.manifest.txt`
- Scope / format: `public` schema + data の PostgreSQL custom format logical backup。Storage / object backup ではない。Storage は Brand data import の対象外。
- `pg_dump` は PostgreSQL 17 / Supabase image `17.6.1.139`、`PGOPTIONS=-c default_transaction_read_only=on`、no owner / no privileges で作成。
- Size: `297283` bytes。SHA256: `688B52216739117593729995B5D80083CBDB5CD4C907D5C5B424D9835CC4D8C1`。
- `pg_restore -l` 成功。TOC entries `727`、`TABLE DATA public` entries `61`。Brand と BrandAlias の schema / data archive entries がある。抽出した Brand rows `0`、BrandAlias rows `0`。Hash recheck は一致。
- Task176 では restore rehearsal を行っていない。検証済みなのは archive integrity、list、data extraction である。

## Literal production dry-run and connectivity

Windows host の Prisma から Railway `DIRECT_URL` の pooler port `5432` に接続する literal dry-run は、`PrismaClientInitializationError` の `Can't reach database server` で失敗した。この結果を DB outage とは扱わない。同じ `DIRECT_URL` で Linux `pg_dump` は成功した。

そこで read-only Linux Node 22 container route を試した。Repository は read-only mount とし、fresh ephemeral minimal Node environment に pinned `@prisma/client 5.7.0`、`prisma 5.7.0`、`tsx 4.21.0` を用い、現行 `prisma/schema.prisma` から Prisma client を生成した。初回は `docs/data/fmp/generated/brand-kana-approved.json` をコピーし忘れたため、DB query 前に失敗した。DB write はない。canonical source JSON を含めた再試行で、production に対する seed script の literal dry-run が exit `0` で完了した。

```text
mode=dry-run
canonicalBrandCount=297
CREATE=297
UPDATE=0
aliasCreate=581
SKIP=0
movementMakerTruePreserved=0
conflicts=0
```

`--apply` は使用しておらず、production write は行っていない。

## Task175 guard and approval gate

Non-local `DATABASE_URL` に対する production apply には、以下の両方の完全一致が必要。Task175 で guard の独立レビューが完了し、確認が不足する場合は Prisma DB query 前に拒否する。Actual production apply は未実行。

- CLI: `--production-confirm=TASK175_CANONICAL_BRAND_IMPORT`
- Environment: `PRODUCTION_CANONICAL_BRAND_IMPORT_CONFIRM=TASK175_CANONICAL_BRAND_IMPORT`

Task176 は次の実行手順の **step 5 より前で停止**する。実際の production DB write には吉田の明示承認が必要。今回の「進めて！」は preflight / backup Task の承認であり、production apply の承認とは扱わない。

## Exact planned execution after Yoshida's explicit approval

1. `origin/main` と local status を再取得し、無関係な未 commit 変更がないこと、および stash が untouched であることを確認する。
2. 書き込み直前に production の Brand / BrandAlias 件数を再照会する。期待値は両方 `0`。
3. Task176 backup を再 hash し、上記 SHA256 と一致することを確認する。
4. 実証済みの Linux container route で literal production dry-run を再実行する。期待値は Brand `CREATE=297`、`aliasCreate=581`、`conflicts=0`、その他の plan fields も上記出力と完全一致。
5. 全確認が一致する場合だけ、同じ pinned ephemeral Linux route で Task175 の二つの confirmation factors と `--apply` を指定して実行する。Windows host Prisma path は使用しない。
6. 書き込み後、Supabase read-only SQL で `Brand=297`、`BrandAlias=581`、duplicate `normalizedAlias` count `0`、BrandAlias orphan FK count `0`、watchBrand count `296`、movementMaker count `3`、ETA / ROLEX / SEIKO の movement maker flags が true であることを確認する。さらに seed を dry-run で再実行し、`CREATE=0`、`UPDATE=0`、`aliasCreate=0`、`SKIP=581`、`conflicts=0` を確認する。
7. Migration は行わない。Data import 自体に deploy は不要。Task175 code は local / unpushed のまま、別途承認を得る。`main` を push すると Railway が自動 deploy する。
8. いずれかが一致しなければ停止する。修復 SQL をその場で考案・実行しない。

Production: pending / backup complete / literal dry-run complete / apply not executed.
