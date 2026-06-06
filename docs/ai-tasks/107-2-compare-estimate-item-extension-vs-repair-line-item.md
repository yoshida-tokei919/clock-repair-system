# AI Task 107-2: EstimateItem拡張案 vs RepairLineItem新設案の比較設計

## 目的

作業マスタ新設前に、帳票・共有ページ・PublicCaseの元になる明細の受け皿を決める。

比較対象は以下の2案。

- A案: 現行の `EstimateItem` を拡張し、実質的な案件明細として使う
- B案: `RepairLineItem` を新設し、案件に紐づく正式な明細本体を作る

今回の目的は、schemaを変更することではなく、今後のschema設計・画面設計・帳票移行の判断材料を整理すること。

## 前提

- 今回は調査・設計ドキュメントのみ。
- DB更新、schema変更、migration作成、seed作成、import script実行、PublicCase再生成は行わない。
- generated JSON / CSV 本体は変更しない。
- 画面実装変更、既存コード変更、不要なリファクタリングは行わない。
- 部品マスタと作業マスタは別物として扱う。
- 部品マスタ全体の仕様は今回決めない。
- FMP過去案件の救済ロジックと、新アプリ通常Repairの構造化入力は切り分ける。
- PublicCaseは、Repair側で確定した構造化データを公開用に別スナップショット化する。

## 本番データ0件の扱い

本番データ0件であれば、既存データ移行コストよりも、通常Repair運用前に明細構造を正しく寄せる価値が高い。

ただし、現行アプリでは既に見積書・納品書・請求書・共有ページ・LINE送信導線が `Repair -> Estimate -> EstimateItem` を中心に組まれている。そのため、長期的にきれいなB案へ進める場合でも、一度に全帳票を置き換えるより、互換レイヤーまたは段階移行が必要。

判断上のポイントは、「本番データ0件なので構造を整理できる」ことと、「既存実装の参照範囲が広いので実装リスクは段階化すべき」ことの両方を満たすこと。

## 107-0 / 107-1 の要点

107-0の結論:

- 現行schemaに独立した内装作業マスタ本体はない。
- `PricingRule.suggestedWorkName` が技術料候補・価格ルール・作業名候補を兼ねている。
- `PricingRule` は作業カテゴリ、内装/外装区分、部品カテゴリ、部品名、処置、B2B/B2C表示名を持たない。
- `PartCategoryMaster` / `PartNameMaster` / `PartsMaster` は部品側の土台として使える。
- 推奨は、`PricingRule` は価格ルールとして残し、作業マスタは新規に作るC案。

107-1の結論:

- 現行の確定明細は `EstimateItem` が中心。
- 技術料/部品は `type = labor / part` で区別する。
- 技術料は保存後に `PricingRule` を後読みしていないため、`PricingRule` 変更で既存技術料表示は直接変わらない。
- 部品は `partsMasterId` を持つが、帳票・共有ページで `PartsMaster.grade` / `notes2` を後読みする箇所がある。
- 請求書は `InvoiceItem` を持たず、Repair/DeliveryNote/EstimateItemから都度集計している。
- LINE送信はPDF添付ではなく共有URL送信で、共有ページHTMLはDB現在値を表示する。
- PublicCaseは公開事例用の別スナップショットであり、帳票・共有ページの確定明細とは分けるべき。

## 現行EstimateItemの役割

現行の `EstimateItem` は名前上は見積明細だが、実際には次の用途に広く使われている。

- 見積書PDFの明細
- 納品書PDFの明細
- 請求書PDFの納品書単位集計元
- お客様共有ページの明細
- LINE送信URL先の共有ページ表示元
- 修理詳細・PDFプレビュー系の明細
- 部品発注・在庫連動の起点

保存されている主な値:

- `itemName`
- `quantity`
- `unitPrice`
- `type`
- `partsMasterId`
- `orderStatus`
- `orderedAt`

不足している主な値:

- `workMasterId`
- `pricingRuleId`
- `workType`
- 作業カテゴリ
- 部品カテゴリ・標準部品名スナップショット
- 作業/処置/処置詳細
- B2B/B2C表示名スナップショット
- 帳票別表示名スナップショット
- 価格表示フラグ
- 税率スナップショット
- 部品grade/note2等の表示補助スナップショット

## A案: EstimateItem拡張案

A案は、現行の `EstimateItem` を「見積明細」という名前のまま拡張し、実質的なRepair確定明細として使う案。

追加候補:

- `workMasterId`
- `pricingRuleId`
- `workType`
- `standardWorkNameSnapshot`
- `estimateDisplayNameSnapshot`
- `deliveryDisplayNameSnapshot`
- `invoiceDisplayNameSnapshot`
- `customerDisplayNameSnapshot`
- `b2bDisplayNameSnapshot`
- `b2cDisplayNameSnapshot`
- `publicCaseDisplayNameSnapshot`
- `partCategoryKeySnapshot`
- `partCategoryNameSnapshot`
- `partKeySnapshot`
- `partNameSnapshot`
- `partGradeSnapshot`
- `partNoteSnapshot`
- `taxRateSnapshot`
- `showOnEstimate`
- `showOnDeliveryNote`
- `showOnInvoice`
- `showOnCustomerPage`
- `showPriceB2B`
- `showPriceB2C`
- `sortOrder`

利点:

- 既存の帳票・共有ページ・LINE導線を大きく壊さずに進めやすい。
- 実装範囲を比較的小さくできる。
- 既存の `Repair -> Estimate -> EstimateItem` の参照を活かせる。
- まずはマスタ後読み問題をスナップショット追加で抑えられる。

欠点:

- `EstimateItem` という名前と責務がさらにずれる。
- 見積、納品、請求、保証、公開事例の元データが「見積明細」に集まり続ける。
- 将来、見積版数や見積差し替えを厳密に扱う場合、Repairの正式明細と見積明細の境界が曖昧になる。
- 請求書や保証書の構造問題は別途残る。

向いている状況:

- 短期に帳票・共有ページの表示安定性を上げたい。
- 画面・帳票の修正範囲を抑えたい。
- 作業マスタ導入の第一段階として、現行フローを維持したい。

## B案: RepairLineItem新設案

B案は、`RepairLineItem` を新設し、Repairに紐づく正式な案件明細本体を作る案。

概念上の役割:

- Repairに紐づく確定明細の本体。
- 作業マスタ、PricingRule、部品マスタの参照を持つ。
- 帳票・共有ページ・PublicCase生成に必要な表示名・価格・フラグをスナップショットとして持つ。
- `EstimateItem` は、必要であれば見積書作成時点の派生明細または互換用ビュー相当に寄せる。

持たせたい候補:

- `repairId`
- `estimateId` または見積版数との関連
- `lineType`: labor / part / other
- `workMasterId`
- `pricingRuleId`
- `partsMasterId`
- `workType`
- 作業カテゴリ・部品カテゴリ・部品名・処置のスナップショット
- 帳票別表示名スナップショット
- B2B/B2C表示名スナップショット
- PublicCase表示名スナップショット
- 数量・単価・税率・金額スナップショット
- 表示フラグ・価格表示フラグ
- 発注状態
- 並び順

利点:

- 「案件明細」と「見積明細」の責務を分けられる。
- 本番データ0件の利点を最大限活かせる。
- 作業マスタ・部品マスタ・PricingRuleとの接続先として自然。
- 帳票・共有ページ・PublicCaseの元データをRepair側に一本化できる。
- 将来の見積版数、納品、請求、保証、公開事例化を整理しやすい。

欠点:

- 修正範囲が大きい。
- 既存の帳票・共有ページ・LINE・PDF生成が `EstimateItem` を広く読んでいるため、移行設計が必要。
- `EstimateItem` との二重管理期間を作ると同期バグのリスクがある。
- 部品発注・在庫連動も移行対象になる。

向いている状況:

- 通常Repair運用前に明細構造を根本整理したい。
- 見積・納品・請求・保証・PublicCaseの責務分離を長期的に重視する。
- 段階移行の実装時間を確保できる。

## 比較表

| 判断軸 | A案: EstimateItem拡張 | B案: RepairLineItem新設 |
|---|---|---|
| 作業マスタとの接続 | `EstimateItem.workMasterId` 追加で接続可能。ただし名前上は見積明細。 | `RepairLineItem.workMasterId` で自然に接続できる。 |
| PricingRuleとの接続 | `EstimateItem.pricingRuleId` 追加で対応可能。 | `RepairLineItem.pricingRuleId` で価格ルール参照として整理しやすい。 |
| 部品マスタとの接続 | 既存 `partsMasterId` を活かせる。表示補助はスナップショット追加が必要。 | `partsMasterId` と部品表示スナップショットを正式明細側に持てる。 |
| 見積書 | 既存参照を活かせる。短期実装が軽い。 | 参照元変更またはEstimateItem派生生成が必要。 |
| 納品書 | 既存参照を活かせる。 | 参照元変更が必要。納品時点スナップショット設計もしやすい。 |
| 請求書 | 現行集計を維持しやすいが、InvoiceItemなし問題は残る。 | 請求元を正式明細にできるが、請求スナップショット設計が別途必要。 |
| 保証書 | `Repair.workSummary` 依存は残る。保証対象明細フラグ追加で改善可能。 | 保証対象作業を正式明細から選べる設計にしやすい。 |
| 共有ページ | 現行参照を活かしつつ、表示名スナップショットへ移行しやすい。 | 参照元変更が必要だが、DB現在値表示の安定性は高めやすい。 |
| LINE送信 | URL導線は維持しやすい。共有ページの中身だけ改善できる。 | URL導線は維持できるが、共有ページ参照元変更が必要。 |
| PublicCase | EstimateItemスナップショットからPublicCaseへ変換できる。 | RepairLineItemスナップショットからPublicCaseへ変換でき、概念上より自然。 |
| 過去表示の安定性 | スナップショット項目を十分追加すれば改善できる。 | 最初から表示スナップショット前提にできる。 |
| 本番データ0件を活かせるか | 中程度。既存構造を温存するため妥協は残る。 | 高い。運用前に責務を整理できる。 |
| 修正範囲 | 小から中。 | 大。 |
| 将来の保守性 | 中。名前と責務のずれが残る。 | 高。責務分離が明確。 |
| 段階導入 | しやすい。 | 可能だが互換レイヤーが必要。 |
| 初期リスク | 低め。 | 高め。 |

比較表の結論:

- 短期安全性はA案が高い。
- 長期保守性はB案が高い。
- 本番データ0件を最大限活かすならB案が理想。
- ただし現行実装の参照範囲を考えると、いきなりB案へ全面移行するより、A案相当のスナップショット設計を先に固め、その項目群をB案の `RepairLineItem` に移せる形で設計するのが安全。

## PartsMaster後読み問題

現行では、部品明細の表示補助として `PartsMaster.grade` / `notes2` を帳票・共有ページで後読みしている箇所がある。

この問題はA案/B案のどちらでも必ず解消対象にするべき。

A案での対応:

- `EstimateItem` に `partGradeSnapshot` / `partNoteSnapshot` / `partNameSnapshot` などを追加する。
- 帳票・共有ページは `PartsMaster` 現在値ではなく、明細スナップショットを優先して表示する。
- `partsMasterId` は在庫・発注・部品実体への参照として残す。

B案での対応:

- `RepairLineItem` に部品表示スナップショットを持たせる。
- `PartsMaster` は仕入・在庫・写真・部品Ref・検索用の部品実体として参照する。
- 帳票・共有ページ・PublicCaseは `RepairLineItem` の確定値を読む。

見解:

`PartsMaster` は現在値が更新されるマスタであり、過去帳票・共有ページの表示名を固定する場所ではない。部品表示名、グレード、注記、公開表示名は、保存時に明細側へスナップショットするのが正しい。

## InvoiceItemがない問題

現行の請求書は `InvoiceItem` を持たず、`Invoice -> Repair -> DeliveryNote -> EstimateItem` から納品書単位で都度集計している。

A案での見方:

- `EstimateItem` に請求表示用スナップショットを追加すれば、集計元の安定性は少し上がる。
- ただし、発行済み請求書の明細を固定する専用スナップショットがない問題は残る。
- 請求書発行後にRepair/EstimateItemが変わった場合の扱いを別途決める必要がある。

B案での見方:

- `RepairLineItem` を請求元にできるため、EstimateItemより責務は自然。
- ただし、請求書自体の発行時点スナップショットは別問題として残る。
- 長期的には `InvoiceLineItem` または「請求書発行時の納品書単位集計スナップショット」を検討すべき。

見解:

`InvoiceItem` がない問題は、A案/B案だけでは完全には解決しない。請求書は法務・会計上の発行済み文書に近いため、将来的には請求書側にも発行時点の集計スナップショットを持たせるべき。

## PublicCase生成元としての比較

A案:

- `EstimateItem` に作業マスタ参照・表示名・価格表示フラグ・部品表示スナップショットを持たせれば、PublicCase生成元として使える。
- 現行の `Repair -> Estimate -> EstimateItem` からPublicCaseへ変換できるため、既存実装との距離は近い。
- ただし、概念上は「見積明細から公開事例を作る」形になり、名前と責務の違和感は残る。

B案:

- `RepairLineItem` をRepair確定明細本体にすれば、PublicCase生成元として最も自然。
- PublicCaseは公開用スナップショットなので、`RepairLineItem` から `PublicCaseWorkItem` / `PublicCasePartItem` へ変換する流れが明確になる。
- FMP過去案件由来のPublicCase生成と、新アプリ通常Repair由来のPublicCase生成を分けやすい。

見解:

PublicCase生成元としてはB案がより自然。ただし、A案でも十分なスナップショット項目を持てば実用上は成立する。公開表示の安定性に必要なのは、モデル名よりも「マスタ後読みをせず、明細確定値からPublicCaseを作る」こと。

## 作業マスタとの接続比較

A案:

- 作業マスタ新設後、`EstimateItem.workMasterId` で接続する。
- `pricingRuleId` は価格決定に使ったルールの参照として持つ。
- 保存時に作業マスタ・PricingRule・部品マスタから表示名・価格・フラグを `EstimateItem` へスナップショットする。
- 既存帳票は徐々に `itemName` からスナップショット項目へ移行できる。

B案:

- 作業マスタ新設後、`RepairLineItem.workMasterId` で接続する。
- `PricingRule` は `RepairLineItem.pricingRuleId` として価格ルール参照に留める。
- `EstimateItem` は見積書用の派生明細として残すか、互換レイヤーとして段階廃止する。
- 帳票・共有ページ・PublicCaseの元データを `RepairLineItem` に揃えられる。

見解:

作業マスタとの接続だけを見るとB案が最もきれい。ただし、現行の読み取り経路が広いため、初期実装ではA案の追加項目を「B案へ移植可能な明細スナップショット仕様」として設計するのが現実的。

## 推奨方針

推奨は **段階B案: RepairLineItem新設を最終形に置きつつ、初期段階ではEstimateItem拡張相当のスナップショット仕様を先に固める**。

理由:

- 本番データ0件なので、長期的には `RepairLineItem` を作る価値が高い。
- `EstimateItem` は既に見積・納品・請求・共有ページ・LINE導線に広く使われており、いきなり全面置換すると修正範囲が大きい。
- 作業マスタ導入で最初に必要なのは、モデル名の整理よりも、帳票・共有ページ・PublicCaseが読む確定表示データをマスタ現在値から切り離すこと。
- A案で定義するスナップショット項目群は、そのままB案の `RepairLineItem` に移せる。

短期判断:

- 次のschema設計では、A案とB案のどちらにも使える「明細スナップショット最小項目」を先に定義する。
- 実装に入る直前に、`EstimateItem` へ追加するか、`RepairLineItem` 新設へ進むかを、修正対象ファイル数とテスト範囲で最終判断する。

長期判断:

- 新アプリ通常Repairの正式明細は `RepairLineItem` 相当に寄せるのが望ましい。
- `EstimateItem` は見積書の版管理・互換用・派生明細として役割を縮小する方向がきれい。

## 推奨する段階的実装順

1. 作業マスタ本体の最小モデルを設計する。
2. A案/B案共通の明細スナップショット項目を確定する。
3. `PartsMaster.grade` / `notes2` 後読みをやめるための部品表示スナップショット項目を決める。
4. `InvoiceItem` なし問題に対し、請求書発行時点スナップショットを別タスク化する。
5. 実装直前に、`EstimateItem` 拡張で始めるか、`RepairLineItem` 新設で始めるかを決める。
6. 初期実装では、RepairEntryForm保存時に作業マスタ・PricingRule・部品マスタから明細スナップショットを生成する。
7. 見積書・納品書・共有ページを、マスタ後読みではなく明細スナップショット参照へ移す。
8. LINE送信URL先の共有ページHTMLも、明細スナップショット参照に揃える。
9. PublicCase生成は、Repair明細スナップショットからPublicCaseスナップショットを作る。
10. 請求書・保証書は、発行時点/保証対象のスナップショット設計を別途追加する。

## FMP過去案件と新アプリ通常Repairの切り分け

FMP過去案件:

- 過去データ救済用。
- 表記ゆれ整理、読み仮名削除、プレースホルダー補正、カテゴリ推定はFMP専用。
- FMP文字列をそのまま新アプリ通常Repairの作業マスタや正式明細設計にしない。

新アプリ通常Repair:

- 最初から構造化入力する。
- 作業マスタ、部品マスタ、PricingRuleから候補を選び、Repair明細に確定スナップショットを保存する。
- FMP専用クリーニングや推定に依存しない。

PublicCase:

- Repair側で確定した構造化データを公開事例用に別スナップショット化する。
- FMP由来か新アプリ由来かを閲覧者に見せない。
- 公開表示名、価格表示可否、コピー除外、B2B/B2C表示差分はPublicCase側で最終表示用に保持する。

## 変更しなかったもの

- DB更新なし
- schema変更なし
- migration作成なし
- seed作成なし
- import script実行なし
- PublicCase再生成なし
- generated JSON / CSV 本体変更なし
- 画面実装変更なし
- 既存コード変更なし
- git addなし
- commitなし
- pushなし
- `.next-dev.err.log` 変更なし
- `tsconfig.tsbuildinfo` 変更なし

## 次タスク案

- Task 107-3: 作業マスタ本体の最小モデル案を設計する。
- Task 107-4: A案/B案共通の明細スナップショット最小項目を定義する。
- Task 107-5: `PartsMaster` 後読みをやめる帳票・共有ページ移行計画を作る。
- Task 107-6: 請求書発行時点スナップショット、または `InvoiceLineItem` 相当の設計を比較する。
- Task 108: 作業マスタと `PricingRule` の接続設計を行う。
- Task 109: RepairEntryFormでの構造化作業入力の設計を行う。
