# Task 108-6: RepairWorkActionをローカルDBへ反映し、12件seed

## 目的

Task 108-5で追加したRepairWork系schemaをローカルDBへ反映し、確定度の高い `RepairWorkAction`（修理作業処置マスタ）12件だけをseedした。

このTaskでは、`RepairWorkCategory`（修理作業カテゴリ）と `RepairWorkName`（修理作業名）のseedは行っていない。

## 変更ファイル

```txt
prisma/seed.ts
```

`RepairWorkAction` 12件を `upsert` で冪等に投入する処理を追加した。

## ローカルDB反映

実行したDB反映コマンド:

```powershell
npx prisma db push
```

ただし、repoの `.env` はリモートSupabase向きだったため、そのまま使わず、以下のローカルDB接続先を明示して実行した。

```txt
localhost:54322/clock_repair_local
```

本番DB / リモートSupabase DBには触っていない。

## seed実行

既存のPrisma seed構成に従い、以下を実行した。

```powershell
npx prisma db seed
```

追加したseedは `RepairWorkAction` のみ。

`RepairWorkCategory` / `RepairWorkName` はseedしていない。

## RepairWorkAction確認結果

DB上の `RepairWorkAction` 件数は12件。

| name | displayName | sortOrder | isActive |
| --- | --- | ---: | --- |
| exchange | 交換 | 10 | true |
| repair | 修理 | 20 | true |
| adjust | 調整 | 30 | true |
| correction | 修正 | 40 | true |
| polish | 研磨 | 50 | true |
| clean | 洗浄 | 60 | true |
| oil | 注油 | 70 | true |
| make | 製作 | 80 | true |
| install | 取付 | 90 | true |
| remove | 除去 | 100 | true |
| hole_tightening | 穴締め | 110 | true |
| staking | かしめ | 120 | true |

## 変更していないもの

以下は変更していない。

```txt
RepairWorkCategory seed
RepairWorkName seed
RepairLineItem
PricingRule
API
UI
RepairEntryForm
帳票
PDF
LINE
PublicCase
migration
本番DB / リモートDB
```

## 検証コマンド結果

以下は成功。

```powershell
npx prisma validate
npx prisma generate
npx prisma db push
npx prisma db seed
npx tsc --noEmit --pretty false --incremental false
```
