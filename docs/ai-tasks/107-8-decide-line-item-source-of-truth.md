# AI Task 107-8: 明細受け皿方針の確定

## 概要

Task 107-6-resetで作成した正本3ファイルと、Task 107-2〜107-7の設計メモを基準に、通常Repairの明細受け皿方針を確定する。

このTaskでは、schema/code/API/UI/seed/DB操作は行わない。今後のschema設計・画面設計・帳票設計へ進む前の設計判断だけを行う。

結論:

**B-2: `RepairLineItem` を正式なRepair明細本体として新設し、`EstimateItem` は見積発行時点のスナップショットとして残す方針を採用する。**

ただし、実装時に既存帳票・共有ページ・PDF・LINE送信の置換リスクが高い場合は、B-3を段階移行手段として使う。B-3は最終責務分離ではなく、B-2へ近づけるための互換期間として扱う。

## 正本ファイルとの関係

基準にした正本ファイル:

- `docs/masters/internal-work-master-design-notes.md`
- `docs/masters/external-work-master-design-notes.md`
- `docs/masters/public-case-design-notes.md`

正本から守る方針:

- 事例掲載に合わせて業務アプリ設計を歪めない。
- 作業マスタは入力補助・標準化の元データであり、帳票・共有ページ・PublicCaseへ直接表示しない。
- 部品マスタ、作業マスタ、PricingRule、PublicCaseは別レイヤーとして扱う。
- 帳票・共有ページに出す値は、Repair明細 / EstimateItem / RepairLineItem 側のスナップショットを正とする。
- PublicCaseは公開事例用の別スナップショットであり、RepairやEstimateItemの直表示にしない。
- FMP過去案件の救済ルールを、新アプリ通常Repairへ持ち込まない。
- 旧Excel由来候補や107-5の大量seed案を、そのまま正式マスタにしない。
- WorkCategoryMaster / WorkNameMaster / InternalWorkMaster / ExternalWorkMaster をいきなりschema化しない。

## 現行EstimateItem中心構造の整理

現行schemaでは、`Repair` に対して `Estimate` が1件紐づき、`Estimate` に `EstimateItem` が複数紐づく。

現行の `EstimateItem` が持つ主な項目:

- `estimateId`
- `itemName`
- `quantity`
- `unitPrice`
- `type`
- `orderStatus`
- `orderedAt`
- `partsMasterId`
- `createdAt`

現行の役割:

- 見積書の明細
- 納品書の明細元
- 請求書の納品書単位集計元
- お客様共有ページの明細元
- LINE送信URL先の共有ページ表示元
- 部品発注・在庫連動の起点

現行の問題:

- `EstimateItem` という名前だが、実質的には見積・納品・請求・共有ページの共通明細になっている。
- `Repair` に紐づく正式な案件明細本体がない。
- `workMasterId` / `pricingRuleId` / B2B/B2C表示名 / 帳票表示名 / PublicCase表示名 / 価格表示フラグなどのスナップショット項目がない。
- 部品明細では `partsMasterId` を持つが、帳票・共有ページで `PartsMaster.grade` / `notes2` などの現在値を後読みするリスクがある。
- `DeliveryNote` と `Invoice` に独立した明細モデルがなく、RepairやEstimateItemから都度集計する構造になっている。

## A案: EstimateItem拡張案

A案は、現行の `EstimateItem` を拡張し、実質的なRepair明細として使い続ける案。

追加する可能性がある項目:

- 作業マスタ参照ID
- PricingRule参照ID
- 部品マスタ参照IDの補助スナップショット
- 内部管理名スナップショット
- 帳票表示名スナップショット
- B2B表示名スナップショット
- B2C表示名スナップショット
- PublicCase表示名スナップショット
- 作業カテゴリpathスナップショット
- 部品カテゴリ/部品名/グレード/注記スナップショット
- 価格表示フラグ
- sortOrder

利点:

- 既存の帳票・共有ページ・LINE送信・PDF生成との距離が近い。
- 実装初期の修正範囲を抑えやすい。
- `PartsMaster.grade` / `notes2` 後読み問題も、スナップショット追加で短期的に改善できる。

欠点:

- `EstimateItem` がさらに「見積明細」ではなくなる。
- 見積発行時点の明細と、Repairの正式明細の境界が曖昧なまま残る。
- 再見積、見積版数、納品、請求、保証、PublicCase生成を整理しにくい。
- 本番データ0件という構造整理の機会を活かしきれない。

判断:

A案は短期安全性が高いが、正本方針で求めている「Repair側の入力構造・明細構造を先に整える」本線としては弱い。互換的な実装の参考にはなるが、最終方針としては採用しない。

## B案: RepairLineItem新設案

B案は、`RepairLineItem` を新設し、Repairに紐づく正式な案件明細本体を作る案。

`RepairLineItem` の責務:

- 通常Repairの確定明細本体。
- 作業マスタ、部品マスタ、PricingRuleの参照IDを持つ。
- 表示名、価格、価格表示フラグ、カテゴリpath、部品表示補助をスナップショットとして持つ。
- 帳票・共有ページ・PublicCase下書き生成の元データになる。
- 作業マスタや部品マスタを後から変更しても、過去表示が勝手に変わらないようにする。

利点:

- Repairの正式明細と、見積発行時点の明細を分けられる。
- 作業マスタ・部品マスタ・PricingRuleとの接続先として自然。
- PublicCaseを、Repair明細スナップショットから公開用スナップショットへ変換する流れが明確になる。
- 本番データ0件のうちに、責務分離を整理できる。
- 将来の再見積、納品、請求、保証、PublicCaseレビューに展開しやすい。

欠点:

- 既存の `EstimateItem` 参照箇所が広いため、実装時の修正範囲は大きい。
- `EstimateItem` との二重管理期間を作る場合、同期ルールを決める必要がある。
- 納品書・請求書の発行時点スナップショットは、`RepairLineItem` 新設だけでは完全には解決しない。

判断:

B案を本線にする。ただし、B案の中でも `EstimateItem` の扱いによって複数パターンがあるため、B-1 / B-2 / B-3を比較して最終方針を決める。

## B-1 / B-2 / B-3 比較

| 案 | 概要 | 利点 | 欠点 | 判断 |
|---|---|---|---|---|
| B-1 | `RepairLineItem` を正式明細にし、`EstimateItem` を廃止または極小化する | 責務分離が最も明快 | 現行帳票・共有ページ・PDF・LINE送信の置換範囲が大きすぎる | 初期採用しない |
| B-2 | `RepairLineItem` を正式明細にし、`EstimateItem` は見積発行時点スナップショットとして残す | Repair明細と見積明細を分けられる。見積版数や発行時点固定に強い | `RepairLineItem` から `EstimateItem` へ写す生成ルールが必要 | 採用 |
| B-3 | `RepairLineItem` を正式明細にするが、当面は `EstimateItem` 互換を厚めに残して段階移行する | 既存実装の置換リスクを下げやすい | 二重管理期間が長引くと、どちらが正か曖昧になる | 実装上の移行手段として許容 |

比較結論:

- 設計上の正はB-2。
- B-1はきれいだが、初期実装の衝撃が大きすぎる。
- B-3は現実的な移行手段だが、最終責務分離としては曖昧さが残る。
- よって、設計方針はB-2、実装段階で必要な互換期間だけB-3を使う。

## 帳票・共有ページへの影響

B-2採用時の原則:

- `RepairLineItem` はRepairの正式明細。
- `EstimateItem` は見積発行時点のスナップショット。
- 見積書は `EstimateItem` を読む。
- 納品書・共有ページは、短期的には既存構造との互換を維持しつつ、最終的には「発行/表示時点で確定した明細スナップショット」を読む。
- 作業マスタ、部品マスタ、PricingRuleの現在値を帳票・共有ページで後読みして表示しない。

見積書:

- `RepairLineItem` から見積作成時に `EstimateItem` を生成する。
- `EstimateItem` は見積発行時点の表示名・数量・単価・税率・価格表示フラグを保持する。
- 見積後に `RepairLineItem` が変わっても、発行済み見積の表示は勝手に変えない。

納品書:

- 現行は `DeliveryNote` に明細モデルがなく、Repair/EstimateItem側から表示・集計している。
- 将来的には納品書発行時点のスナップショットを別途検討する。
- 初期段階では、B-2でも納品書の読み取り元を急に全面変更しない。マスタ後読みを避けることを優先する。

共有ページ:

- 共有ページはPDF添付ではなく共有URLで表示されるため、HTML表示がDB現在値の影響を受けやすい。
- 共有ページでは、作業マスタ・部品マスタの現在値ではなく、明細スナップショットを読む。
- B2B/B2C表示名と価格表示フラグは、明細スナップショットを正とする。

LINE送信:

- LINE送信自体は共有URLを送る導線なので、明細受け皿の変更は共有ページ側の表示元変更として扱う。
- LINE送信処理そのものを作業マスタやPublicCaseに直結しない。

## PublicCaseへの影響

B-2採用時のPublicCase生成方針:

```txt
RepairLineItem
↓
PublicCase下書き
↓
公開レビュー
↓
PublicCase / PublicCaseWorkItem / PublicCasePartItem
```

PublicCaseは公開用スナップショットなので、表示時に `RepairLineItem`、作業マスタ、部品マスタ、PricingRuleを後読みしない。

PublicCaseへ渡すべきもの:

- 公開用作業表示名
- 公開用部品表示名
- B2B/B2C表示名
- B2B価格表示可否
- B2C価格非表示方針
- 価格表示する場合の金額
- 交換部品表示
- relatedWorkLineItemId相当の紐づけ
- 内部メモを除外した公開用メモ
- コピー表記除外の判定結果
- sourceSnapshot

PublicCase表示ルール:

- B2C PublicCaseは価格非表示を基本とする。
- B2B PublicCaseは `showPriceB2b = true` かつ正の価格のみ表示する。
- 0円は表示しない。
- 未紐づけPartItem価格は表示しない。
- 内部管理文言は表示しない。
- 部品代ラベルは使わず、必要なら「交換部品」とする。
- コピー表記は表示しない。

## PricingRuleへの影響

PricingRuleは価格ルールとして残す。

PricingRuleの責務:

- 技術料候補価格の提示。
- 顧客種別、ブランド、モデル、キャリバーなどによる価格候補条件。
- 既存資産としての価格ルール管理。

PricingRuleの責務ではないもの:

- 作業マスタ本体。
- 作業カテゴリ本体。
- B2B/B2C表示名の正本。
- 帳票・共有ページ・PublicCaseの表示値。

B-2採用時の接続:

- `RepairLineItem` に `pricingRuleId` を持たせる案を第一候補にする。
- `EstimateItem` には、見積発行時点で選ばれた価格・表示名をスナップショットする。
- PricingRuleの名称や価格が後で変わっても、過去の `RepairLineItem`、`EstimateItem`、PublicCase表示が勝手に変わらないようにする。
- 将来的にPricingRuleへ `workNameId` などを追加する可能性はあるが、PricingRuleを作業マスタ本体にしない。

## 作業マスタ・部品マスタへの影響

作業マスタ:

- 入力補助・標準化・候補選択の元データ。
- 作業カテゴリ、作業対象、作業/処置、default表示名、default価格表示フラグを持つ候補として設計する。
- 選択時に `RepairLineItem` へ参照IDとスナップショットを保存する。
- 帳票・共有ページ・PublicCase表示時に、作業マスタ現在値を直接読まない。

部品マスタ:

- 部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索などのためのマスタ。
- 部品選択時に `RepairLineItem` へ参照IDと表示用スナップショットを保存する。
- `PartsMaster.grade` / `notes2` など、過去表示に影響する値は明細側へスナップショットする。
- 帳票・共有ページ・PublicCase表示時に、部品マスタ現在値を直接読んで表示名補助に使わない。

明細側に保存するスナップショット:

- 内部管理名
- 帳票表示名
- B2B表示名
- B2C表示名
- PublicCase下書き用表示名
- 作業カテゴリpath
- 部品カテゴリpath
- 部品名
- グレード
- 顧客向け注記
- 価格
- 価格表示フラグ
- 税率
- 並び順

## 本番データ0件前提での判断

本番データ0件であることは、B-2を採用する大きな理由になる。

理由:

- 運用開始後に `EstimateItem` を正式明細として使い続けると、後からRepair明細へ分離する負債が大きくなる。
- 今のうちにRepair正式明細と見積発行時点スナップショットを分ければ、見積・納品・請求・共有ページ・PublicCaseの責務を整理しやすい。
- FMP過去案件の救済設計と、新アプリ通常Repairの構造化入力を分けやすい。
- 作業マスタ実装前に明細受け皿を決めることで、WorkCategoryMaster / WorkNameMasterを焦ってschema化する必要がなくなる。

ただし、現行コードは `EstimateItem` を広く参照している。そのため、実装時はB-2を一気に全画面へ広げるのではなく、既存表示を壊さない移行順を別Taskで設計する。

## 推奨結論

採用方針:

**B-2: `RepairLineItem` を正式なRepair明細本体として新設し、`EstimateItem` は見積発行時点スナップショットとして残す。**

採用理由:

- 正本方針の「先に業務アプリ側の入力構造・明細構造を整える」に最も合う。
- 作業マスタ・部品マスタ・PricingRule・PublicCaseを、Repair明細スナップショットを経由して接続できる。
- PublicCaseをRepairやEstimateItemの直表示にせず、公開用スナップショットとして生成しやすい。
- `EstimateItem` の責務肥大を止められる。
- 本番データ0件の段階で、長期保守性の高い構造へ寄せられる。

補足:

- B-3は、実装時の互換期間として許容する。
- B-3を使う場合でも、どちらが正かは `RepairLineItem` と明記する。
- A案は短期安全性は高いが、最終方針としては採用しない。

## 採用する責務分離

採用する責務分離:

| レイヤー | 役割 | 表示時の扱い |
|---|---|---|
| 作業マスタ | 入力補助・標準化・default表示名・候補選択 | 帳票・共有ページ・PublicCaseで直表示しない |
| 部品マスタ | 部品実体、在庫、仕入、価格、サイズ、写真、検索 | 表示名・グレード・注記は明細スナップショットを優先する |
| PricingRule | 価格候補・価格ルール | 選択後は明細側へ価格と参照IDを保存する |
| RepairLineItem | 通常Repairの正式明細本体 | 帳票・共有ページ・PublicCase下書きの主な元データ |
| EstimateItem | 見積発行時点の明細スナップショット | 見積書の正本として使う |
| DeliveryNote | 納品書単位の文書 | 将来的に発行時点スナップショットを検討する |
| Invoice | 請求書単位の文書 | 将来的にInvoiceLineItemまたは請求スナップショットを検討する |
| PublicCase | 公開事例用スナップショット | RepairLineItemやマスタを表示時に後読みしない |

データの流れ:

```txt
作業マスタ / 部品マスタ / PricingRule
↓
RepairLineItem
↓
EstimateItem
↓
見積書
```

```txt
RepairLineItem
↓
納品書 / 共有ページ / PublicCase下書き
↓
PublicCase
```

注意:

- 実際の納品書・共有ページの読み取り元切り替えは、既存実装への影響調査後に段階設計する。
- `RepairLineItem` 新設を決めても、直ちにschema変更しない。

## 後続Task案

Task 107-9:

`RepairLineItem` 最小フィールド案を、107-3の共通スナップショット仕様に基づいて再整理する。

含めること:

- labor / part / discount / adjustment の扱い
- workMasterId / pricingRuleId / partsMasterId
- 表示名スナップショット
- 価格表示フラグ
- relatedWorkLineItemId
- sortOrder
- 見積発行時に `EstimateItem` へ写す項目

Task 107-10:

B-2採用時の既存参照箇所影響調査を行う。

確認対象:

- RepairEntryForm
- estimate-item関連lib
- document actions
- document API
- PDF生成
- 共有ページ
- LINE送信導線
- PublicCase生成
- 部品発注・在庫連動

Task 108-0:

明細受け皿方針B-2を前提に、内装作業マスタ設計へ戻る。

ただし、schema実装はまだ行わない。

## 未解決事項

- `RepairLineItem` の正式モデル名をどうするか。
- `EstimateItem` と `RepairLineItem` の同期/生成タイミングをどうするか。
- 見積版数をどこまで厳密に扱うか。
- 納品書発行時点スナップショットを作るか。
- `InvoiceLineItem` 相当を作るか、請求書発行時点の集計スナップショットに留めるか。
- B2C共有ページの価格表示方針を、B2C PublicCaseと同じく非表示寄りにするか。
- 部品発注・在庫連動を `EstimateItem` 起点から `RepairLineItem` 起点へいつ移すか。
- FMP過去案件由来PublicCase候補と、新アプリ通常Repair由来PublicCase下書きの生成経路をどこまで共通化するか。

## 変更しなかったもの

- prisma/schema.prisma の変更なし
- migration作成なし
- db pushなし
- seed実装なし
- API変更なし
- UI変更なし
- RepairEntryForm変更なし
- PricingRule変更なし
- PublicCase生成ロジック変更なし
- 帳票/PDF/LINE送信処理変更なし
- テスト修正なし
- git addなし
- commitなし
- pushなし
