# Task178: production foundation master dry-run record

## Scope

Task178 は docs-only。Task142 の基礎 6 マスタ importer について、production の read-only 件数、literal dry-run、source integrity review と将来の production write 条件を記録する。Task177 の Brand / BrandAlias production import は完了済みだが、それは基礎マスタ投入の承認を意味しない。

## Git / production baseline

- Task178 開始時の local HEAD: `77b5472 docs: record production brand import`
- `origin/main`: `c674be7 feat: add related repair case links`
- local `main` は `origin/main` より 5 commits ahead。Task178 文書作成前の working tree は clean。
- `stash@{0}: accidental-copilot-task3-20260924` は untouched。
- Railway production commit: `c674be7c0d70e697bda787d9c28dc35e6c928240`
- Railway deployment: `8d697214-0a13-4246-bfcb-130643a2f8a2` / `SUCCESS` / `RUNNING`

## Current production counts

2026-09-24 08:38:40.017661+00 の production read-only SQL では、投入対象 6 表はすべて 0 件だった。

| Task142 import target | Production count |
| --- | ---: |
| `RepairWorkCategory` (`parentId IS NULL`) | 0 |
| `RepairWorkAction` | 0 |
| `PartCategoryMaster` | 0 |
| `PartNameMaster` | 0 |
| `PartGradeMaster` | 0 |
| `Supplier` | 0 |

同じ read-only SQL では `RepairWorkName`、`PricingRule`、`PartsMaster` も各 0 件。ただし、この 3 表は Task178 / Task142 importer の投入対象外であり、今回の dry-run はその復元計画ではない。

## Importer safety

`scripts/import-production-foundation-masters.ts` は既定で dry-run。`plannedChanges` による予定差分の読み取りだけを行い、`upsertAll` は `--execute` がある場合に限り呼び出す。実行時の書き込み対象は上記 6 マスタだけで、単一 transaction 内で upsert する。`RepairWorkName`、`PricingRule`、`PartsMaster`、`Brand`、`Model`、`WatchReference`、`Caliber`、その他の表は書き込まない。

`PartNameMaster.categoryId` は production 側 `PartCategoryMaster` の upsert 結果から解決する。source DB の ID はコピーしない。

将来の non-local production `--execute` には、non-local `DATABASE_URL` と、CLI `--production-confirm=TASK142_FOUNDATION_MASTER_IMPORT`、環境変数 `PRODUCTION_FOUNDATION_MASTER_IMPORT_CONFIRM=TASK142_FOUNDATION_MASTER_IMPORT` の両方が必要。`--clone` は localhost `DATABASE_URL` と専用の `TASK142_CLONE_IMPORT` 確認を要求するため、non-local production には使用できない。

## Literal production dry-run

production dry-run は ephemeral Linux Node 22 container で実行した。repo は read-only mount。`@prisma/client 5.7.0`、`prisma 5.7.0`、`tsx 4.21.0` を pin し、現行 `prisma/schema.prisma` を使用した。Railway production `DIRECT_URL` を container 内の `DATABASE_URL` に対応させた。`--execute` は指定していない。終了コードは 0。

| Master | `expectedCounts` | `planned.create` | `planned.update` |
| --- | ---: | ---: | ---: |
| `RepairWorkCategory` | 17 | 17 | 0 |
| `RepairWorkAction` | 24 | 24 | 0 |
| `PartCategoryMaster` | 17 | 17 | 0 |
| `PartNameMaster` | 236 | 236 | 0 |
| `PartGradeMaster` | 4 | 4 | 0 |
| `Supplier` | 10 | 10 | 0 |
| **Total** | **308** | **308** | **0** |

出力値は以下のとおり。

```json
{
  "mode": "dry-run",
  "expectedCounts": {
    "repairWorkCategories": 17,
    "repairWorkActions": 24,
    "partCategories": 17,
    "partNames": 236,
    "partGrades": 4,
    "suppliers": 10
  },
  "planned": {
    "create": {
      "repairWorkCategories": 17,
      "repairWorkActions": 24,
      "partCategories": 17,
      "partNames": 236,
      "partGrades": 4,
      "suppliers": 10
    },
    "update": {
      "repairWorkCategories": 0,
      "repairWorkActions": 0,
      "partCategories": 0,
      "partNames": 0,
      "partGrades": 0,
      "suppliers": 0
    }
  },
  "executed": false
}
```

これは production のその時点に対する予定差分であり、production write の実行結果ではない。

## Source integrity review

独立した静的 source review で、importer target の件数は正確に 17 / 24 / 17 / 236 / 4 / 10 と確認された。6 マスタの natural key 重複はすべて 0、`PartNameMaster.categoryKey` の参照先欠落は 0、`partType` 不一致は 0。RepairWorkAction、RepairWorkCategory、PartGradeMaster、Supplier は既存 seed 定義と一致する。`PartNameMaster` は標準部品名マスタであり、実部品・在庫の `PartsMaster` とは区別する。

## `RepairWorkAction.other` boundary

グローバル行 `other` / `その他` は、承認済みの 24 行 seed / importer target に含まれる。一方、`docs/ai/04_IMPLEMENTATION_RULES.md` の INTERNAL / EXTERNAL 許可処置一覧には `other` がない。Task173 はその業務・UI 上の用途を **OPEN DECISION** としている。現行 `RepairEntryForm` は明示的な INTERNAL / EXTERNAL allowed sets で表示候補を絞り、`other` を除外する。

したがって seed 定義どおりのマスタ行復元は blocker ではない。ただし、正本ルールが明示的に変わるまで通常の INTERNAL / EXTERNAL 選択で使えるようにしない。

## Independent review

独立 reviewer の判定は P0 なし、P1 なし。Task178 文書 commit 前に importer を修正する必要はない。P2 は下記の production-doc 記録の古さのみ。

## P2: stale production-doc record

`docs/ai/03_CURRENT_TASK.md` と `docs/ai/05_INQUIRY_AI_RUNBOOK.md` は、production commit を旧 `38d38c0` と記録したままである。今回確認した現在の production commit は `c674be7c0d70e697bda787d9c28dc35e6c928240`。この 2 文書は Task178 では変更せず、後続の明示的に許可された docs-maintenance Task に差分を引き継ぐ。

## Future production-write gates

production への適用は別 Task・別 approval gate とする。適用前に以下を順に行う。

1. 必読文書を再読し、Git HEAD / `origin/main` / working tree / stash と production deployment を再確認する。
2. production の対象 6 マスタ件数を read-only で再照会する。
3. 新しい production backup を作成し、hash と archive を検証する。
4. production に対する literal dry-run を再実行し、**308 create / 0 update** の完全一致を要求する。不一致なら停止する。
5. 実行内容と証拠を吉田に提示し、明示承認を得るまで停止する。

承認後のみ、non-local `DATABASE_URL`、二重確認、`--execute` を指定して **1 回だけ**実行する。`prisma db seed` は実行しない。実行後は read-only で 6 表の正確な件数、natural key 重複グループ 0、カテゴリのない `PartNameMaster` 0、importer の `postVerification.expectedCountMismatches` が空であることを確認する。さらに dry-run を再実行し、0 create / 全 target 行が update 計画となることを確認する。どの確認でも不一致なら停止する。

データのみの import には migration / schema 変更 / deploy は不要。後続 Task で code 変更が生じた場合は、その差分を別途評価する。

## Non-goals / status

Task178 では production write を行わず、dry-run のみなので新しい backup は取得していない。`--execute`、migration、deploy、push、tag、backup、restore は行わない。既存ファイルも変更しない。

**Production: pending / dry-run complete / no foundation-master write.**
