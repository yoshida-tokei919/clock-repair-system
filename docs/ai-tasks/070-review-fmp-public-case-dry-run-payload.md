# AI Task 070: FMP PublicCase dry-run payloadレビュー

## 目的

Task 069で生成したFMP PublicCase dry-run payloadを確認し、DB投入前に問題ない形になっているか、また投入前に修正・方針確認すべきリスクがあるかを整理する。

今回はレビューのみ。DB接続、DB更新、migration、seed、API、UI、`prisma/schema.prisma` 変更、CSV / Excel / JSON本体変更は行わない。

## 前提

- Task 069のdry-run結果は、件数が期待値と一致している。
- `criticalWarningCount = 0`
- `errors = []`
- `importBlocked = false`
- FMP由来は `sourceType = FMP`、`repairId = null` として扱う。
- B2C価格表示は常にfalseとする。
- 未紐づけPartItemはB2B価格表示から外す。

## 参照ファイル

- `docs/ai-tasks/069-dry-run-import-fmp-public-cases.md`
- `docs/ai-tasks/068-design-fmp-public-case-import.md`
- `docs/ai-tasks/067-review-public-case-schema-diff.md`
- `docs/data/fmp/generated/import-dry-run/import-summary.json`
- `docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/warning-payload.sample.json`
- `scripts/dry-run-import-fmp-public-cases.ts`

## import-summary確認

`import-summary.json` の内容はTask 069の報告と一致している。

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
| showPriceB2bTrueCount | 7,262 |
| showPriceB2bFalseCount | 851 |
| showPriceB2cTrueCount | 0 |
| showPriceB2cFalseCount | 8,113 |
| importBlocked | false |

`actualChecks` はすべて期待値と一致している。

## PublicCase payloadレビュー

sample payloadでは以下が確認できた。

- `tempPublicCaseKey` が `FMP:{sourceRepairId}` 形式
- `sourceType = FMP`
- `sourceRepairId` が入っている
- `repairId = null`
- `reviewStatus = NEEDS_REVIEW`
- `b2bPublishStatus = HIDDEN`
- `b2cPublishStatus = HIDDEN`
- `showPriceB2b = true`
- `showPriceB2c = false`
- `warnings` / `excludeReasons` / `sourceSnapshot` がある

DB投入前の形としては概ね問題ない。

注意点:

- `PublicCase.showPriceB2b = true` が全Caseで立っている。
- Case単位の `totalAmount` も保持されるため、将来のB2B表示でCase合計をそのまま出すか、WorkItem / PartItemの明細合計を正とするかは方針確認が必要。
- B2Cでは `showPriceB2c = false` だが、API・公開ページ実装時に `totalAmount` や各価格カラムをselectしない設計が必要。

## WorkItem payloadレビュー

sample payloadでは、WorkItemの主要項目はschemaと対応している。

- `tempPublicCaseKey`
- `tempWorkItemKey`
- `sourceArea`
- `sourceSlot`
- `sourceText`
- `normalizedSourceText`
- `isRuleMatched`
- `isPublishable`
- `reviewStatus`
- `normalizedWorkName`
- `b2bDisplayName`
- `b2cDisplayName`
- `laborPrice`
- `showPriceB2b`
- `showPriceB2c`
- `ruleSnapshot`

価格表示制御:

- 公開対象・レビュー済み・価格ありのWorkItemだけ `showPriceB2b = true`
- 非公開・除外・価格なしのWorkItemは `showPriceB2b = false`
- `showPriceB2c = false` は全件

気になった表示名:

- `針取付（3H）ハリトリツケ`
- `○○交換技術料コウカンギジュツリョウ`
- `例インデックス取付（3H）レイトツ`

これらは外装レビューExcel由来の表示名と思われるが、B2B / B2C公開表示としてはやや不自然。DB投入自体の阻害要因ではないが、公開前レビューまたは表示名クリーニング対象にする。

## PartItem payloadレビュー

sample payloadでは、PartItemの主要項目はschemaと対応している。

- `tempPublicCaseKey`
- `relatedWorkItemTempKey`
- `sourceArea`
- `sourceSlot`
- `sourceText`
- `normalizedSourceText`
- `displayName`
- `price`
- `showPriceB2b`
- `showPriceB2c`
- `relationStatus`
- `reviewStatus`
- `excludeReason`
- `metadata`

`relatedWorkItemTempKey` はnullableで、schema側の `PublicCasePartItem.relatedWorkItemId Int?` と合っている。

linked PartItem:

- `relatedWorkItemTempKey` あり
- `relationStatus = LINKED`
- `reviewStatus = APPROVED`
- `showPriceB2b = true`
- `showPriceB2c = false`

unlinked PartItem:

- `relatedWorkItemTempKey = null`
- `relationStatus = UNLINKED`
- `reviewStatus = NEEDS_REVIEW`
- `excludeReason = part_without_publishable_work`
- `showPriceB2b = false`
- `showPriceB2c = false`

DB投入前の形としては、未レビュー・未紐づけ部品代がB2Bへ自動表示されるリスクを抑えられている。

## Warning payloadレビュー

sample payloadでは、Warningは管理しやすい形に分解されている。

- `tempPublicCaseKey`
- `code`
- `severity`
- `message`
- `target`
- `metadata.rawWarning`

確認できた主な形式:

```txt
code = part_without_publishable_work
severity = REVIEW
target = external-1 / internal-2 など
```

summary上は以下も確認済み。

```txt
code = source_text_normalized
severity = INFO
```

`code` / `severity` / `target` で検索・分類しやすいため、`PublicCaseWarning` へ投入する形として妥当。

## B2B/B2C価格表示レビュー

payload全体の価格表示フラグ:

| payload | B2B true | B2B false | B2C true | B2C false |
| --- | ---: | ---: | ---: | ---: |
| PublicCase | 2,924 | 0 | 0 | 2,924 |
| WorkItem | 3,331 | 385 | 0 | 3,716 |
| PartItem | 1,007 | 466 | 0 | 1,473 |

B2C:

- `showPriceB2cTrueCount = 0`
- 現payloadではB2C価格表示フラグは安全。
- ただし、DBに価格値自体は保存されるため、B2C公開API / UIでは価格カラムを返さない実装が必須。

B2B:

- WorkItemは公開対象・レビュー済み・価格ありだけtrue。
- PartItemはWorkItemに紐づき、価格ありの場合だけtrue。
- 未紐づけPartItem 466件はすべてfalse。

B2B価格表示の主な注意点は、PublicCase単位の `showPriceB2b = true` と `totalAmount` をどう扱うか。明細表示を正とし、未レビュー部品を含みうるCase合計を自動表示しない方針が安全。

## unlinked PartItemレビュー

unlinked PartItemは466件。

dry-run summaryとsampleから以下を確認した。

- `relatedWorkItemTempKey = null`
- `reviewStatus = NEEDS_REVIEW`
- `relationStatus = UNLINKED`
- `excludeReason = part_without_publishable_work`
- `showPriceB2b = false`
- `showPriceB2c = false`

Task 064 / 068の方針に合っている。

DB投入前に止める問題ではないが、公開前レビュー対象としてUIや一覧で抽出できるようにする必要がある。

## schemaとの整合性

大きなズレはない。

対応関係:

| payload | schema |
| --- | --- |
| `sourceType` | `PublicCase.sourceType` |
| `sourceRepairId` | `PublicCase.sourceRepairId` |
| `repairId` | `PublicCase.repairId` |
| `b2bPublishStatus` | `PublicCase.b2bPublishStatus` |
| `b2cPublishStatus` | `PublicCase.b2cPublishStatus` |
| `showPriceB2b` | 各PublicCase系モデルの `showPriceB2b` |
| `showPriceB2c` | 各PublicCase系モデルの `showPriceB2c` |
| `relatedWorkItemTempKey` | 実投入時に `PublicCasePartItem.relatedWorkItemId` へ変換 |
| `code` / `severity` | `PublicCaseWarning.code` / `severity` |

実DB投入時に変換が必要なもの:

- `tempPublicCaseKey` はDB保存しない。投入処理内の対応Map用。
- `tempWorkItemKey` はDB保存しない。投入処理内の対応Map用。
- `relatedWorkItemTempKey` は `PublicCaseWorkItem.id` 解決後に `relatedWorkItemId` へ変換する。

## Git管理すべき生成物 / しない生成物

推奨:

- `scripts/dry-run-import-fmp-public-cases.ts` はGit管理する。
- `docs/ai-tasks/069...` / `070...` の調査・レビューmdはGit管理する。
- `import-summary.json` は小さく、dry-run結果の証跡としてGit管理してもよい。
- `*.sample.json` はレビュー用として小さいため、短期的にはGit管理してもよい。
- `public-case-candidates.json` のような全件生成物や、将来の全件payload出力は再生成可能なため `.gitignore` 候補。

注意:

- generated配下は派生データであり、コミット対象を広げると差分が大きくなる。
- 価格・修理情報を含むため、長期的には全件生成物はGit管理せず、スクリプトとsummary/sampleだけに絞るのが安全。
- 今回は `.gitignore` 変更は行わない。

## 懸念点

1. PublicCase単位の `showPriceB2b = true` と `totalAmount` を、将来のB2B表示でそのまま使うと、未レビューPartItemを含む合計表示になる可能性がある。
2. B2C価格フラグはfalseだが、DBには価格値が保存されるため、B2C API / UIで価格カラムを返さない制御が別途必要。
3. 外装WorkItem表示名に `例`、読み仮名、`○○` が混在しているものがあり、公開表示前にクリーニングまたはレビューが必要。
4. sample payloadは20件のみで、全payloadそのものは出力していない。全件検証はsummaryとスクリプト内チェックに依存している。
5. `sourceSnapshot` にどこまで保持するかは、公開禁止情報を入れない方針を継続する必要がある。

## 修正が必要そうな点

DB投入前に必ず検討したい点:

- B2BでCase合計 `totalAmount` を自動表示しない方針にする、または `PublicCase.showPriceB2b` の意味を「B2B候補」か「Case合計表示許可」か明確にする。
- 外装表示名の `例`、読み仮名、`○○` を公開前レビュー対象として抽出する。
- 実投入スクリプトでは、`relatedWorkItemTempKey` から `relatedWorkItemId` への変換失敗時に `NEEDS_REVIEW` / `showPriceB2b = false` へ落とす防御を入れる。
- generated配下の全件生成物をGit管理しない方針なら、後続で `.gitignore` 方針を決める。

現時点でdry-run payload生成そのものを止める重大問題は見つからない。

## 修正不要と判断した点

- `sourceType = FMP`
- `sourceRepairId` 必須・重複チェック
- `repairId = null`
- B2B/B2C公開状態が初期 `HIDDEN`
- B2C価格表示trueが0件
- unlinked PartItemのB2B/B2C価格表示false
- Warningの `code` / `severity` / `target` 分解
- `relatedWorkItemTempKey` を一時キーとして使うdry-run方針
- DB未接続のdry-runスクリプト構成

## 確認結果

```powershell
npx tsc --noEmit --pretty false --incremental false
```

結果:

- 成功

## 次タスク案

- Task 071: B2B表示金額とPublicCase.totalAmountの扱い整理
- Task 072: 外装表示名クリーニング対象の抽出
- Task 073: FMP PublicCase import script実装
