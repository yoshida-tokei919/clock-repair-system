# Task179: production foundation master import

## Scope

Task178でproduction dry-run済みのfoundation master 6種を、ユーザー承認後にproductionへ投入し、事後検証するproduction data Task。

対象:
- RepairWorkCategory: 17
- RepairWorkAction: 24
- PartCategoryMaster: 17
- PartNameMaster: 236
- PartGradeMaster: 4
- Supplier: 10
- 合計: 308

対象外:
- RepairWorkName
- PricingRule
- PartsMaster
- Brand / BrandAlias
- Model / WatchReference / Caliber
- schema / migration / deploy / push / tag

## Approval and Git baseline

ユーザーの「うん、それですすめて！」を、直前に合意したfoundation master production投入手順を進める承認として扱った。

投入前:
- local HEAD: `341f6e2 docs: record production foundation master dry run`
- origin/main: `c674be7 feat: add related repair case links`
- local main: origin/mainより6 commits ahead
- working tree: clean
- `stash@{0}: accidental-copilot-task3-20260924` untouched
- Railway production commit: `c674be7c0d70e697bda787d9c28dc35e6c928240`
- Railway deployment: `8d697214-0a13-4246-bfcb-130643a2f8a2` / SUCCESS / RUNNING
- Supabase: ACTIVE_HEALTHY / PostgreSQL 17.6.1

## Pre-write production state

Supabase read-only SQL at 2026-09-24 10:21:33.286693+00:

- RepairWorkCategory(parentId IS NULL) = 0
- RepairWorkAction = 0
- PartCategoryMaster = 0
- PartNameMaster = 0
- PartGradeMaster = 0
- Supplier = 0

## Fresh backup

production write直前にfresh logical backupを作成。

Archive:
`C:\Users\yoshi\clock-repair-backups\20260924\production-pre-task179-foundation-import-20260924-192204.dump`

Manifest:
`C:\Users\yoshi\clock-repair-backups\20260924\production-pre-task179-foundation-import-20260924-192204.manifest.txt`

検証:
- size: 310454 bytes
- SHA256: `7C589FE899689F1423D43B05BA72C7C0DC464B57D833A121114812207ED63F01`
- hash recheck: match
- PostgreSQL 17 custom format
- public schema + data
- `PGOPTIONS=-c default_transaction_read_only=on`
- `pg_restore -l`: success
- TOC entries: 727
- public TABLE DATA entries: 61
- 対象6マスタのbackup内データ行: すべて0

restore rehearsal（実復元試験）はTask179では実施していない。

補足: BrandAliasの簡易regex行カウントは過去に誤差が出ることが確認済みで、Task179のfoundation判定には使用していない。

## Final literal dry-run

Task178と同じephemeral Linux routeを使用。

- Node 22 bookworm
- repo read-only mount
- `@prisma/client@5.7.0`
- `prisma@5.7.0`
- `tsx@4.21.0`
- current `prisma/schema.prisma`
- Railway production `DIRECT_URL` をcontainer内の `DATABASE_URL` として使用
- credentialsは出力していない
- `--execute` なし

結果:

| Master | create | update |
| --- | ---: | ---: |
| RepairWorkCategory | 17 | 0 |
| RepairWorkAction | 24 | 0 |
| PartCategoryMaster | 17 | 0 |
| PartNameMaster | 236 | 0 |
| PartGradeMaster | 4 | 0 |
| Supplier | 10 | 0 |
| **Total** | **308** | **0** |

`executed=false` / exit code 0。

## Guarded production execute

Task142 importerのproduction二重確認を使用。

必須:
- CLI: `--production-confirm=TASK142_FOUNDATION_MASTER_IMPORT`
- env: `PRODUCTION_FOUNDATION_MASTER_IMPORT_CONFIRM=TASK142_FOUNDATION_MASTER_IMPORT`
- `--execute`
- non-local `DATABASE_URL`

同じpinned ephemeral Linux routeから1回だけ実行した。

結果:
- mode: `production-execute`
- planned create: 17 / 24 / 17 / 236 / 4 / 10
- planned update: all 0
- `executed=true`
- exit code 0

importerのpostVerification:
- actual counts: 17 / 24 / 17 / 236 / 4 / 10
- `expectedCountMismatches=[]`
- `partNamesWithoutCategory=0`
- `duplicateNaturalKeyGroups=0`

6マスタへのupsertは単一Prisma transaction内で実行される。importerはこの6表以外を直接writeしない。

## Independent post-write verification

Supabase read-only SQL at 2026-09-24 10:25:04.58849+00:

- RepairWorkCategory = 17
- RepairWorkAction = 24
- PartCategoryMaster = 17
- PartNameMaster = 236
- PartGradeMaster = 4
- Supplier = 10
- PartNameMaster without category = 0
- RepairWorkName = 0
- PricingRule = 0
- PartsMaster = 0
- Brand = 297
- BrandAlias = 581

最初のread-only確認SQLでは存在しない `RepairWorkAction.repairType` 列を参照してquery errorになったが、writeは伴わない検証SQLのみの失敗。正しい実カラムで再照会した。

global masterとして:
- `RepairWorkAction.name=other`
- `displayName=その他`

の行が存在する。

ただし `docs/ai/04_IMPLEMENTATION_RULES.md` および現行 `RepairEntryForm` の INTERNAL / EXTERNAL allowed-action listには `other` を含めない。正本ルールが明示変更されるまで通常の内装/外装作業候補には出さない。

## Post-write literal dry-run

productionへ再度dry-runを実行。

| Master | create | update |
| --- | ---: | ---: |
| RepairWorkCategory | 0 | 17 |
| RepairWorkAction | 0 | 24 |
| PartCategoryMaster | 0 | 17 |
| PartNameMaster | 0 | 236 |
| PartGradeMaster | 0 | 4 |
| Supplier | 0 | 10 |

`executed=false` / exit code 0。

これは全natural keyがproductionに存在することを示す。ただし、このdry-runと件数検証だけで全308行の全field値を独立に1件ずつ比較したことにはならない。

## Independent review

Codexをproduction operatorとは別のread-only reviewerとして使用した。

Verdict:
- P0: none
- P1: none
- production/importer修正 required before Task179 commit: none

Reviewer確認:
- 308件のupsertは単一Prisma transaction内。
- 直接write対象は6マスタのみ。
- pre-state 0、pre-dry-run 308 create / 0 update、execute exit 0、postVerification一致、Supabase read-only counts一致、post-dry-run 0 create / 308 updateの証跡は、意図したimport成功の根拠として十分。
- backup fileのsize / SHA256一致をreviewer側でもread-only確認。
- restore rehearsal未実施。
- `other` 行は現行UI allowed-action listから除外されているため、global master行の存在自体はblockerではない。

既知P2:
- `docs/ai/03_CURRENT_TASK.md`
- `docs/ai/05_INQUIRY_AI_RUNBOOK.md`

のproduction commit記録が旧 `38d38c0` のまま。実productionは `c674be7`。Task179対象外のため変更しない。

## Deferred requirements for next implementation Task

今回のfoundation importとは分離するが、ユーザー確認済み要件として次Taskへ引き継ぐ。

### PartNameMaster

- PartNameMaster（標準部品名）は表記揺れ防止のため案件入力で**必須選択**。
- 案件入力からPartNameMasterを自動増殖させない。
- 新しい標準部品名が必要な場合は、案件保存とは別の確認済みマスタ追加フローで扱う。
- PartsMaster（実部品）は案件運用から成長してよい。
- 現行コードでは新規PartsMaster作成時に `standardPartNameId` が保存APIへ渡っていないように見えるため、次Taskで正式に調査・修正する。

### External part drilldown

外装**部品**は:
```text
Brand
→ Product Ref / Case Ref
→ PartCategoryMaster
→ PartNameMaster（必須）
→ PartsMaster
```

Ref / Case Refを主要条件とし、Modelだけで候補を広げない。

### External repair work drilldown

外装**作業**は:
```text
Brand
→ Model
→ RepairWorkCategory
→ PartNameMaster
→ RepairWorkAction
→ detail
→ PricingRule
```

外装作業はModel軸でよく、Refを必須条件にしない。

上記の外装部品Ref対応とstandardPartNameId保存修正はTask179では実装しない。

## Production / deployment state

- foundation master production import: complete
- schema change: none
- migration: none
- application deploy: none
- GitHub push: none
- production tag: none
- Railway application remains on `c674be7c0d70e697bda787d9c28dc35e6c928240`

Production: foundation master import complete; post-verification passed; no application deploy.
