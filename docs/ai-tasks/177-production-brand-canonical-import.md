# Task177: production canonical Brand / BrandAlias import

## Scope

Task176で検証したcanonical Brand / BrandAliasを、吉田の明示承認「本番投入OK」の後にproductionへ投入し、事後検証するproduction data Task。

対象:
- Brand 297件
- BrandAlias 581件

対象外:
- schema / migration変更
- Model / WatchReference / Caliber
- RepairWorkCategory / PartNameMaster等のfoundation master
- PartsMaster / PricingRule
- deploy / push / production tag
- Storage object

## Approval and baseline

吉田がproduction DB writeを明示承認した後に実行した。

書き込み直前:
- local HEAD: `3893926 docs: record production brand import preflight`
- origin/main: `c674be7 feat: add related repair case links`
- local main: origin/mainより4 commits ahead
- working tree: clean
- `stash@{0}: accidental-copilot-task3-20260924` untouched
- production Railway commit: `c674be7c0d70e697bda787d9c28dc35e6c928240`
- production deployment: `8d697214-0a13-4246-bfcb-130643a2f8a2` / SUCCESS / RUNNING

Supabase read-only SQL at 2026-09-24 08:23:20.120896+00:
- Brand = 0
- BrandAlias = 0
- duplicate normalizedAlias = 0

## Backup

Task176でproduction write前に作成したfresh backupを再hashし、一致を確認してからapplyした。

Archive:
`C:\Users\yoshi\clock-repair-backups\20260924\production-pre-task176-brand-import-20260924-165553.dump`

Manifest:
`C:\Users\yoshi\clock-repair-backups\20260924\production-pre-task176-brand-import-20260924-165553.manifest.txt`

- size: 297283 bytes
- SHA256: `688B52216739117593729995B5D80083CBDB5CD4C907D5C5B424D9835CC4D8C1`
- re-hash before apply: match
- PostgreSQL custom format / public schema + data
- read-only pg_dump
- pg_restore list検証済み
- backup内 Brand rows = 0
- backup内 BrandAlias rows = 0
- restore rehearsalは未実施

## Final literal dry-run before write

Windows-host Prisma pathはSupabase poolerへ到達できないため使用せず、Task176で実証済みのLinux Node 22 ephemeral container routeを使用した。

Repositoryはread-only mount。ephemeral environment:
- Node 22 bookworm
- @prisma/client 5.7.0
- prisma 5.7.0
- tsx 4.21.0
- current prisma/schema.prismaからPrisma Client生成
- current canonical source / brand-kana-approved.jsonを使用
- Railway production DIRECT_URLをcontainer内でDATABASE_URLとして使用
- credentialsは出力していない

書き込み直前literal dry-run:

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

exit code 0。

## Guarded production apply

Task175のnon-local production guardを使用した。以下の両方を一致させた場合のみapplyを許可:

- CLI: `--production-confirm=TASK175_CANONICAL_BRAND_IMPORT`
- environment: `PRODUCTION_CANONICAL_BRAND_IMPORT_CONFIRM=TASK175_CANONICAL_BRAND_IMPORT`

同じpinned ephemeral Linux routeで、`--apply`と二重confirmationを指定して1回だけ実行。

apply output:

```text
mode=apply
canonicalBrandCount=297
CREATE=297
UPDATE=0
aliasCreate=581
SKIP=0
movementMakerTruePreserved=0
conflicts=0
```

exit code 0。

seedはtransaction内でBrand create / canonical update / BrandAlias createを実行する。今回UPDATEは0。

## Post-write verification

最初のread-only検証SQLでPrisma field名 `nameEn/nameJp` をDB実カラム名として使用したため、PostgreSQLからcolumn不存在エラーになった。この失敗はread-only verification queryのみで、production writeのrollback/追加writeには関係しない。その後、DB実カラム名 `name_en/name_jp` に修正して再検証した。

Supabase read-only SQL at 2026-09-24 08:25:45.725006+00:

- Brand = 297
- BrandAlias = 581
- duplicate normalizedAlias count = 0
- BrandAlias orphan FK count = 0
- watchBrand count = 296
- movementMaker count = 3

movement maker確認:
- ETA: isWatchBrand=false / isMovementMaker=true / NORMAL / name_en=ETA / name_jp=ETA
- ROLEX: isWatchBrand=true / isMovementMaker=true / NORMAL / name_en=ROLEX / name_jp=ロレックス
- SEIKO: isWatchBrand=true / isMovementMaker=true / NORMAL / name_en=SEIKO / name_jp=セイコー

さらに同じproduction Linux routeでseedをdry-run再実行:

```text
mode=dry-run
canonicalBrandCount=297
CREATE=0
UPDATE=0
aliasCreate=0
SKIP=581
movementMakerTruePreserved=0
conflicts=0
```

exit code 0。

この再dry-runにより、seedが検査するcanonical Brand fieldsと全581 normalized aliasesについて追加・更新不要であることを確認した。


## Independent review

production apply後、Codexをoperatorとは別のread-only reviewerとして使用し、Task175-177、seed実装、canonical helper、Brand / BrandAlias schema、Git差分を確認した。

Verdict:
- P0: none
- P1: none
- P2: none
- blocking findings: none
- Task177 commit前のrequired correction: none

Reviewer確認:
- dry-runはtransaction前にreturnする。
- Brand create / Brand update / BrandAlias createは単一Prisma transaction内で実行され、他テーブルへのwriteはない。
- apply plan出力だけではcommit済みwriteの証拠にならないが、今回のexit code 0とpost-state SQL、post-apply dry-runを合わせれば意図したimport成功の証拠として十分。
- post-apply dry-runはcanonical Brand fieldsとnormalizedAliasの所属/不足を検証するが、全581件の表示用alias文字列を独立に1件ずつ再比較する検証ではない。
- reviewer自身はproduction DBを直接再queryせず、operatorが記録したproduction read-only evidenceとsourceを独立レビューした。

## Production / deployment state

- production DB data import: complete
- migration: none
- schema change: none
- application deploy: none
- GitHub push: none
- production tag: none
- Railway application remains on commit `c674be7c0d70e697bda787d9c28dc35e6c928240`
- Task175 guard code and Task173-176 docs remain local/unpushed
- pushing main would trigger Railway auto-deploy, so this Taskではpushしない

## Next

次Taskではfoundation masterについて、既存Task142 importerをproduction dry-runし、
- RepairWorkCategory 17
- RepairWorkAction 24
- PartCategoryMaster 17
- PartNameMaster 236
- PartGradeMaster 4
- Supplier 10

の計画を確認する。Brand投入成功をfoundation master投入の自動承認にはしない。別Task・別承認ゲートで扱う。

Production: Brand / BrandAlias import complete; post-verification passed; no application deploy.
