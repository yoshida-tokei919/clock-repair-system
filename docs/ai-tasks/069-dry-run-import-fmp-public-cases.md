# AI Task 069: FMP PublicCase import dry-run

## 目的

FMP公開候補JSONを読み込み、PublicCase系テーブルへ投入する予定のpayloadをdry-run生成する。

今回はDB接続・DB更新を行わず、投入予定件数、警告、エラー、価格表示フラグ、サンプルpayloadをファイル出力して検証する。

## 前提

- 入力は `docs/data/fmp/generated/public-case-candidates.json`
- 入力JSON本体は変更しない
- `sourceType = FMP` として扱う
- FMP由来では `sourceRepairId` 必須
- FMP由来では `repairId = null`
- WEB_APP由来の事例化とは混ぜない
- B2C価格表示は常にfalse
- B2B価格表示は安全に紐づいたWorkItem / PartItemだけtrue
- `part_without_publishable_work` は投入停止せず、未紐づけPartItemとして残す

## 参照ファイル

- `prisma/schema.prisma`
- `docs/ai-tasks/068-design-fmp-public-case-import.md`
- `docs/ai-tasks/067-review-public-case-schema-diff.md`
- `docs/ai-tasks/066-implement-public-case-db-models.md`
- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `scripts/generate-fmp-public-case-candidates.ts`

## dry-run設計

作成したスクリプト:

- `scripts/dry-run-import-fmp-public-cases.ts`

このスクリプトは以下を行う。

- `public-case-candidates.json` を読み込む
- `sourceType = FMP` として検証する
- `sourceRepairId` 必須・空文字不可・重複不可を検証する
- `repairId = null` のPublicCase payloadを生成する
- WorkItem payloadを生成する
- PartItem payloadを生成する
- Warning payloadを生成する
- DB実IDの代わりに `tempPublicCaseKey` / `tempWorkItemKey` / `relatedWorkItemTempKey` を使う
- 件数がTask 063 / 068の期待値と合うか検証する
- summaryとsample payloadを `docs/data/fmp/generated/import-dry-run/` へ出力する

DBクライアントやPrisma Clientはimportしていない。

## 生成payload概要

### PublicCase payload

主な項目:

- `tempPublicCaseKey`
- `sourceType = FMP`
- `sourceRepairId`
- `repairId = null`
- 時計情報
- `reviewStatus = NEEDS_REVIEW`
- `b2bPublishStatus = HIDDEN`
- `b2cPublishStatus = HIDDEN`
- `showPriceB2b = true`
- `showPriceB2c = false`
- 金額合計
- warnings / excludeReasons
- sourceSnapshot

### PublicCaseWorkItem payload

主な項目:

- `tempPublicCaseKey`
- `tempWorkItemKey`
- sourceArea / sourceSlot
- sourceText / normalizedSourceText
- isRuleMatched / isPublishable
- reviewStatus
- 表示名
- laborPrice
- showPriceB2b / showPriceB2c
- ruleSnapshot

### PublicCasePartItem payload

主な項目:

- `tempPublicCaseKey`
- `relatedWorkItemTempKey`
- sourceArea / sourceSlot
- sourceText / normalizedSourceText
- displayName
- price
- showPriceB2b / showPriceB2c
- relationStatus
- reviewStatus
- metadata

### PublicCaseWarning payload

主な項目:

- `tempPublicCaseKey`
- code
- severity
- message
- target
- metadata

## 件数結果

`npx tsx scripts/dry-run-import-fmp-public-cases.ts` の結果:

| 項目 | 件数 |
| --- | ---: |
| inputCaseCount | 2,924 |
| publishCandidateCaseCount | 2,924 |
| publicCasePayloadCount | 2,924 |
| workItemPayloadCount | 3,716 |
| partItemPayloadCount | 1,473 |
| warningPayloadCount | 472 |
| criticalWarningCount | 0 |
| reviewWarningCount | 466 |
| infoWarningCount | 6 |
| unlinkedPartItemCount | 466 |
| importBlocked | false |

期待値との一致:

| 項目 | 期待値 | 結果 |
| --- | ---: | --- |
| PublicCase | 2,924 | 一致 |
| 内装候補WorkItem | 2,624 | 一致 |
| 外装候補WorkItem | 711 | 一致 |
| Warning総数 | 472 | 一致 |
| `part_without_publishable_work` | 466 | 一致 |
| `source_text_normalized` | 6 | 一致 |
| critical warning | 0 | 一致 |
| B2C価格表示true | 0 | 一致 |

## critical / review / info warning

| severity | 件数 | 扱い |
| --- | ---: | --- |
| CRITICAL | 0 | 1件でもあれば `importBlocked = true` |
| REVIEW | 466 | 投入可能だが公開前レビュー対象 |
| INFO | 6 | ログ扱い |

warning code別:

| code | 件数 |
| --- | ---: |
| `part_without_publishable_work` | 466 |
| `source_text_normalized` | 6 |

## unlinked PartItem の扱い

未紐づけPartItemは466件。

dry-run payloadでは以下にしている。

- `relatedWorkItemTempKey = null`
- `reviewStatus = NEEDS_REVIEW`
- `relationStatus = UNLINKED`
- `excludeReason = part_without_publishable_work`
- `showPriceB2b = false`
- `showPriceB2c = false`

これにより、部品情報を失わず、B2B価格表示へ自動混入しない。

## 価格表示フラグ検証

payload全体の集計:

| 項目 | 件数 |
| --- | ---: |
| showPriceB2b true | 7,262 |
| showPriceB2b false | 851 |
| showPriceB2c true | 0 |
| showPriceB2c false | 8,113 |

内訳:

| payload | B2B true | B2B false | B2C true | B2C false |
| --- | ---: | ---: | ---: | ---: |
| PublicCase | 2,924 | 0 | 0 | 2,924 |
| WorkItem | 3,331 | 385 | 0 | 3,716 |
| PartItem | 1,007 | 466 | 0 | 1,473 |

B2C価格表示trueは0件。未紐づけPartItemのB2B価格表示trueも0件。

## importBlocked 判定

今回のdry-run結果:

```txt
importBlocked = false
errors = []
criticalWarningCount = 0
```

blocking条件:

- `sourceRepairId` 欠落
- `sourceRepairId` 重複
- `sourceType` がFMP以外
- critical warningあり
- 期待件数との不一致
- B2C価格表示trueが1件以上
- 未紐づけPartItemの `showPriceB2b = true`

## 出力ファイル

- `docs/data/fmp/generated/import-dry-run/import-summary.json`
- `docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/warning-payload.sample.json`

sample payloadは各20件。

## DB未接続確認

今回のスクリプトは以下を行わない。

- DB接続
- DB更新
- Prisma Client import
- migration作成
- seed作成
- API実装
- UI実装
- 通常Repairへの投入
- CSV / Excel / JSON本体の変更

出力したのはdry-run用の生成ファイルのみ。

## 実行確認

```powershell
npx tsx scripts/dry-run-import-fmp-public-cases.ts
npx tsc --noEmit --pretty false --incremental false
```

結果:

- `npx tsx scripts/dry-run-import-fmp-public-cases.ts`: 成功
- `npx tsc --noEmit --pretty false --incremental false`: 成功

補足:

- 通常実行では `tsx` 内部のesbuild起動がサンドボックスで `spawn EPERM` になったため、同じDB未接続dry-runコマンドを権限付きで再実行して成功。

## 次タスク案

- Task 070: FMP PublicCase import script実装
- Task 071: ローカルDB投入検証
- Task 072: 公開候補一覧UI設計
