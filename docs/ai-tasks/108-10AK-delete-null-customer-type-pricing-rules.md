# Task 108-10AK: 旧 customerType=null PricingRule の削除

作成日: 2026-06-24

対象ブランチ: `wip-publiccase-workmaster-20260606`

## 目的

108-10AJ で `PricingRule.customerType` を B2B / B2C で必ず持つ方針に変更したため、ローカル仮データとして残っていた `customerType = null` の PricingRule を削除する。

## 背景

現在の確定仕様では、顧客は必ず B2B または B2C のどちらかである。

- B2B: `customerType = business`
- B2C: `customerType = individual`
- `customerType = null` は旧データ / 不正データ扱い
- 新規保存で `customerType = null` を作らない
- dropdown候補にも `customerType = null` は出さない

今回はローカル仮データ整理であり、本番データ移行ではない。`customerType = null` を `business` / `individual` へ変換せず、削除する。

## 削除対象

削除対象は `PricingRule.customerType IS NULL` のみ。

削除前に確認した対象:

| id | suggestedWorkName | minPrice | maxPrice | customerType | brandId | modelId | caliberId | repairWorkCategoryId | targetPartNameId | repairWorkActionId | detailLabel |
| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| 1 | ムーブメント オーバーホール | 30000 | 30000 | null | 1 | 2 | null | 1 | `cmql1w4sq00dbwms1eknaey3p` | 13 | null |
| 2 | ムーブメント オーバーホール | 15000 | 15000 | null | 1 | 2 | null | null | null | null | null |
| 3 | ムーブメント オーバーホール | 12000 | 12000 | null | 1 | 2 | null | 1 | `cmql1w4sq00dbwms1eknaey3p` | 13 | null |
| 4 | ゼンマイ 交換 | 0 | 0 | null | 1 | 2 | null | 3 | `cmql1w47z004nwms12hmtzzay` | 1 | null |

## 削除前件数

- `customerType = null`: 4件

## 実行したコマンド

```powershell
node -e "const {PrismaClient}=require('@prisma/client'); const prisma=new PrismaClient(); (async()=>{ const result=await prisma.pricingRule.deleteMany({where:{customerType:null}}); console.log(JSON.stringify(result,null,2)); await prisma.$disconnect(); })().catch(async e=>{ console.error(e); await prisma.$disconnect(); process.exit(1); });"
```

実行結果:

```json
{
  "count": 4
}
```

## 削除後件数

- `customerType = null`: 0件
- `customerType = business`: 1件
- `customerType = individual`: 2件

削除後に残っている PricingRule:

| id | suggestedWorkName | minPrice | maxPrice | customerType | repairWorkCategoryId | targetPartNameId | repairWorkActionId |
| ---: | --- | ---: | ---: | --- | ---: | --- | ---: |
| 5 | ムーブメント オーバーホール | 30000 | 30000 | individual | 1 | `cmql1w4sq00dbwms1eknaey3p` | 13 |
| 6 | ムーブメント オーバーホール | 15000 | 15000 | individual | 1 | `cmql1w4sq00dbwms1eknaey3p` | 13 |
| 7 | ムーブメント オーバーホール | 15000 | 15000 | business | 1 | `cmql1w4sq00dbwms1eknaey3p` | 13 |

## 削除しなかったもの

- `customerType = business` の PricingRule
- `customerType = individual` の PricingRule
- schema
- migration
- seed
- B2B/B2C derived candidate
- 候補ラベル表示
- PartsMaster検索系
- 帳票 / PDF / LINE / 共有ページ / PublicCase

## 検証結果

- `customerType = null` の PricingRule が0件であることを確認
- `customerType = business` / `individual` の PricingRule が残っていることを確認
- `npx prisma validate`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功
- `npx prisma generate`: dev server が Prisma DLL を保持している場合は EPERM になる可能性があるため、実行結果を完了報告に記録する

## 後続Task

- B2B/B2C derived candidate
- 候補ラベル表示
- 必要に応じたローカル仮データ再作成手順の整理
