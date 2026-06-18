# Task 108-10M: 時計修理業務アプリのマスタ責務一覧

## 目的

時計修理業務アプリで使うマスタの責務を整理し、今後の設計・実装で Codex / AI が責務を混同しないための基準にする。

整理する観点:

```txt
どのマスタが何のためにあるか
何を持つか
何を持たないか
どのマスタと接続するか
UIではどう見せるか
処理が重くならないようにどう使うか
```

このファイルでは、英語名だけでなく必ず日本語説明を併記する。

例:

```txt
MovementCaliber（ムーブメントCal）
MovementMaker（ムーブメント製造元）
Base Cal.（ベースCal）
RepairWorkAction（処置マスタ）
PartNameMaster（標準部品名マスタ）
PartsMaster（実部品・在庫マスタ）
PricingRule（価格ルール）
movementCaliberId（実ムーブメントCal ID）
baseMovementCaliberId（ベースムーブメントCal ID）
targetPartNameId（作業対象部品名ID）
partsMasterId（実部品ID）
```

## 最重要方針

### マスタとスナップショットを分ける

マスタは入力補助・候補選択・標準化のために使う。

帳票・共有ページ・PublicCase（公開事例）では、マスタを後読みして直接表示しない。

表示値は以下を正とする。

```txt
RepairLineItem（案件明細本体）
→ 通常Repairの確定明細。表示名・価格・参照IDをsnapshot保存する。

EstimateItem（見積スナップショット）
→ 見積発行時点の明細snapshot。

PublicCase（公開事例）
→ 公開用に別途作るsnapshot。
```

### 部品マスタと作業マスタを分ける

```txt
部品マスタ
→ 部品交換・購入・在庫・価格・サイズ・写真・仕入先・海外検索などのためのマスタ。

作業マスタ
→ 案件入力・作業内容・処置・技術料・B2B/B2C表示名のためのマスタ。
```

### 作業ドリルダウンと価格ドリルダウンを分ける

作業ドリルダウンは「何をしたか」を決める。

```txt
RepairWorkCategory（作業カテゴリ）
PartNameMaster（標準部品名）
RepairWorkAction（処置）
detailLabel（詳細）
```

価格ドリルダウンは「いくらにするか」を決める。

内装:

```txt
作業内容
+ BrandMaster（時計ブランド）
+ MovementCaliber（実ムーブメントCal）
+ Base MovementCaliber（ベースムーブメントCal）
+ customerType（顧客区分）
```

外装:

```txt
作業内容
+ BrandMaster（時計ブランド）
+ ModelMaster（モデル）
+ Ref（リファレンス）
+ 部品Ref
+ サイズ
+ customerType（顧客区分）
```

Brand（ブランド） / Cal（Cal） / Ref（リファレンス）は作業名そのものではなく、価格候補・部品候補・事例検索を絞る条件である。

## Calマスタ（ムーブメントCalマスタ）の扱い

以下4つは、1つの Calマスタ（ムーブメントCalマスタ）から引く。

```txt
1. MovementMaker（ムーブメント製造元）
2. MovementCaliber（ムーブメント製造元Cal）
3. Base MovementMaker（ベースムーブメント製造元）
4. Base MovementCaliber（ベースムーブメント製造元Cal）
```

保存上は以下2本の参照で表現する。

```txt
movementCaliberId（実ムーブメントCal ID）
baseMovementCaliberId（ベースムーブメントCal ID）
```

重要:

```txt
Calマスタ側では、ETA 2892.A2 はただの「メーカー ETA / Cal 2892.A2」。
ベースCalという属性は持たない。

案件側・時計側で baseMovementCaliberId（ベースムーブメントCal ID）に参照された時だけ、
その案件における「ベースCal」として扱う。
```

例:

```txt
OMEGA 1120
movementCaliberId（実ムーブメントCal ID） → OMEGA 1120
baseMovementCaliberId（ベースムーブメントCal ID） → ETA 2892.A2

ROLEX 3135
movementCaliberId（実ムーブメントCal ID） → ROLEX 3135
baseMovementCaliberId（ベースムーブメントCal ID） → null
```

## Calマスタと内装部品マスタの責務分離

```txt
MovementCaliber（ムーブメントCalマスタ）
= Calそのもの。
例: ETA 2892.A2 / OMEGA 1120 / ROLEX 3135

PartsMaster（実部品・在庫マスタ）
= そのCalに使える実部品。
例: ETA 2892.A2用ゼンマイ / ETA 2892.A2用筒カナ / OMEGA 1120用切替伝え車
```

Calマスタそのものを内装部品マスタにしない。

ただし、内装部品マスタは Calマスタを参照する。

```txt
MovementCaliber（ムーブメントCalマスタ）
- ETA 2892.A2

PartsMaster（実部品・在庫マスタ）
- ETA 2892.A2用ゼンマイ
- ETA 2892.A2用筒カナ
- OMEGA 1120用切替伝え車
```

## 時計ブランドとムーブメント製造元の分離

```txt
BrandMaster（時計ブランドマスタ）
= 時計ブランド。
例: OMEGA / ROLEX / TAG HEUER

MovementMaker（ムーブメント製造元マスタ）
= ムーブメント製造元。
例: ETA / Valjoux / Frederic Piguet / Lemania / OMEGA / ROLEX
```

同じ「ROLEX」でも以下は意味が違う。

```txt
時計ブランドとしてのROLEX
ムーブメント製造元としてのROLEX
```

UI上ではわかりやすく見せるが、責務は混同しない。

## 作業入力の確定方針

作業入力は以下のドリルダウンを基本にする。

```txt
RepairWorkCategory（作業カテゴリ）
→ PartNameMaster（標準部品名 / 作業対象部品名）
→ RepairWorkAction（処置）
→ detailLabel（詳細）
```

それぞれの扱い。

```txt
RepairWorkCategory（作業カテゴリ）
→ 選択式

PartNameMaster（標準部品名マスタ）
→ 選択式

RepairWorkAction（処置マスタ）
→ 選択式

detailLabel（詳細）
→ 選択 + 自由入力可
```

自由入力を許可するのは原則として `detailLabel（詳細）` のみ。

## RepairWorkAction（処置マスタ）の確定方針

RepairWorkAction（処置マスタ）は以下15個で初期固定する。

```txt
交換
修理
調整
修正
研磨
洗浄
注油
製作
取付
除去
穴締め
かしめ
オーバーホール
検査
その他
```

### オーバーホール

件数が多く、業務上重要なため独立した処置とする。

```txt
カテゴリ: ムーブメント
部品名: ムーブメント
処置: オーバーホール
詳細: なし
```

### 検査

防水・動作・精度・消費電流などを `detailLabel（詳細）` で吸収する。

```txt
処置: 検査
詳細: 防水

処置: 検査
詳細: 消費電流
```

### その他

どの処置にも入らない少数作業の逃げ道。

```txt
処置: その他
詳細: 磁気抜き
```

### 新しい処置を増やす基準

原則15個から増やさない。

新しい細かい作業表現は、まず「その他 + 詳細」または「検査 + 詳細」で受ける。

件数が増え、検索・集計・表示上の価値が明確になった場合のみ、RepairWorkAction（処置マスタ）への昇格を検討する。

## ムーブメントカテゴリとムーブメント部品名

PartNameMaster（標準部品名マスタ）に「ムーブメント」を追加候補とする。

理由:

```txt
ムーブメントカテゴリでも、部品名欄を選択式で統一できるようにするため。
```

例:

```txt
カテゴリ: ムーブメント
部品名: ムーブメント
処置: オーバーホール
詳細: なし

カテゴリ: ムーブメント
部品名: ムーブメント
処置: 検査
詳細: 動作

カテゴリ: ムーブメント
部品名: ムーブメント
処置: その他
詳細: 磁気抜き
```

注意:

```txt
ムーブメント一式
```

は正式部品名として採用しない。

## 内装価格候補の優先順位案

内装の価格候補は、以下の優先順位で考える。

```txt
1. 時計ブランド + 実ムーブメントCal + 作業内容
2. 実ムーブメントCal + 作業内容
3. 時計ブランド + ベースムーブメントCal + 作業内容
4. ベースムーブメントCal + 作業内容
5. 時計ブランド + 作業内容
6. 作業内容のみ
```

例:

```txt
ROLEX + ROLEX 3135 + オーバーホール
→ 価格確定に近い

BREITLING + Valjoux 7750 + オーバーホール
→ 7750系でも別価格にできる

OMEGA / TAG HEUER / LONGINES + Valjoux 7750 + オーバーホール
→ 同価格候補として扱える
```

## 内装部品検索の優先順位案

内装部品検索では、実CalとベースCalの両方を使う。

例: OMEGA 1120

```txt
OMEGA 1120 用部品
ETA 2892.A2 用部品
```

使い分け:

```txt
OMEGA 1120 の切替伝え車
→ OMEGA 1120 で探す

OMEGA 1120 のゼンマイ
→ ETA 2892.A2 で探す
```

したがって、PartsMaster（実部品・在庫マスタ）は MovementCaliber（ムーブメントCalマスタ）を参照できるようにする。

## UIで複雑に見せない方針

DB上はマスタを分けるが、入力画面ではまとめて見せる。

### 時計情報

内部的には:

```txt
movementCaliberId（実ムーブメントCal ID）
baseMovementCaliberId（ベースムーブメントCal ID）
```

UIでは:

```txt
Cal.       OMEGA 1120
Base Cal.  ETA 2892.A2
```

または編集時のみ:

```txt
ムーブメント製造元        OMEGA
ムーブメントCal           1120

ベースムーブメント製造元  ETA
ベースムーブメントCal     2892.A2
```

### 作業入力

内部的には:

```txt
repairWorkCategoryId（作業カテゴリID）
targetPartNameId（作業対象部品名ID）
repairWorkActionId（処置ID）
detailLabel（詳細）
```

UIでは:

```txt
カテゴリ / 部品名 / 処置 / 詳細
```

1セットとして見せる。

## 処理が重くならないための方針

マスタを分けても、毎回すべてをJOINしなければ処理は重くならない。

### 避けること

```txt
案件一覧で全部のマスタをJOINする
入力画面ロード時に巨大な候補を全件取得する
検索のたびに関係ないマスタまで取得する
帳票表示時にマスタを直接参照する
```

### 採用する方針

```txt
小さいマスタはキャッシュする
候補が多いマスタは検索文字入力後に絞り込み取得する
Cal候補はメーカー選択後に取得する
部品候補は作業カテゴリ・部品名・Calが揃ってから取得する
価格候補は作業・ブランド・Cal・顧客区分が揃ってから取得する
帳票・共有ページ・PublicCaseはRepairLineItemなどのsnapshotを表示する
```

重要:

```txt
RepairWorkName（標準作業名マスタ）や PricingRule（価格ルール）を後から変更しても、
過去の帳票・共有ページ・PublicCase表示が勝手に変わらないようにする。
```

そのため、表示値は RepairLineItem（案件明細本体）や EstimateItem（見積スナップショット）に保存する。

## 各マスタの責務一覧表

| マスタ名 | 日本語名 | 責務 | 持つもの | 持たないもの | 参照先 | 参照される側 | UIでの見え方 | 処理上の注意 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BrandMaster（時計ブランドマスタ / 現schema: Brand） | 時計ブランド | 時計ブランドの標準化 | `name`（内部名）, `nameEn`（英語名）, `nameJp`（日本語名）, `kana`（カナ）, `initialChar`（頭文字） | ムーブメント製造元としての意味、部品在庫、価格 | なし | Model（モデル）, Watch（時計）, Repair（修理案件）, PartsMaster（実部品・在庫）, PricingRule（価格ルール） | ブランド入力・検索候補 | MovementMaker（ムーブメント製造元）と概念を混同しない |
| ModelMaster（モデルマスタ / 現schema: Model） | 時計モデル | ブランド配下のモデル標準化 | `brandId`（時計ブランドID）, `name`（内部名）, `nameEn`（英語名）, `nameJp`（日本語名） | Ref別の細部、部品在庫、作業名 | BrandMaster（時計ブランド） | WatchReference（リファレンス）, Watch（時計）, PartsMaster（実部品・在庫）, PricingRule（価格ルール） | モデル入力・検索候補 | 外装価格では条件になりやすいが、作業名そのものではない |
| MovementMaker（ムーブメント製造元マスタ / 現schemaでは Brand を兼用中） | ムーブメント製造元 | Calの製造元を表す | 製造元名。例: ETA / Valjoux / OMEGA / ROLEX | 時計ブランドとしての意味、部品在庫 | なし、またはCaliber（ムーブメントCal）側のbrandIdで表現 | Caliber（ムーブメントCal）, Repair（修理案件）, PartsMaster（実部品・在庫） | ムーブメント製造元欄 | 時計ブランドと同名でも責務は別 |
| MovementCaliber（ムーブメントCalマスタ / 現schema: Caliber） | ムーブメントCal | Calそのものの標準化 | `brandId`（製造元ID）, `name`（Cal名）, `movementType`（ムーブメント種別）, `standardWorkMinutes`（標準作業分） | ベースCal属性、在庫、価格、部品名 | MovementMaker（ムーブメント製造元） | Watch（時計）, Repair（修理案件）の `movementCaliberId`（実ムーブメントCal ID）/ `baseMovementCaliberId`（ベースムーブメントCal ID）, PartsMaster（実部品・在庫）, PricingRule（価格ルール） | Cal. / Base Cal. | Calマスタ側に「ベースCal」属性を持たせない |
| PartCategoryMaster（部品カテゴリマスタ） | 部品カテゴリ | 標準部品名を分類する | `key`（安定キー）, `partType`（内装/外装系区分）, `nameJa`（日本語名）, `nameEn`（英語名）, `sortOrder`（表示順）, `isActive`（有効） | 作業カテゴリ、在庫、価格 | なし | PartNameMaster（標準部品名） | 部品名候補の分類 | RepairWorkCategory（作業カテゴリ）と似ているが別物 |
| PartNameMaster（標準部品名マスタ） | 標準部品名 | 作業対象部品名・標準部品名の統一 | `key`（安定キー）, `categoryId`（部品カテゴリID）, `partType`（部品区分）, `nameJa`（日本語名）, `displayJa`（表示名）, `sortOrder`（表示順） | 在庫、仕入先、価格、写真、個別品番 | PartCategoryMaster（部品カテゴリ） | RepairWorkName（標準作業名）, RepairLineItem（案件明細）の `targetPartNameId`（作業対象部品名ID）, PartsMaster（実部品・在庫）, PricingRule（価格ルール） | 対象部品 select | `targetPartNameId`（作業対象部品名ID）で使い、`partsMasterId`（実部品ID）と混同しない |
| PartGradeMaster（部品グレードマスタ） | 部品グレード | 純正/FIT等の部品品質・調達種別 | `key`（安定キー）, `nameJa`（日本語名）, `nameEn`（英語名）, `sortOrder`（表示順）, `isActive`（有効） | 部品名、在庫、価格ルール本体 | なし | PartsMaster（実部品・在庫） | 部品グレード選択 | 部品名ではなく部品の品質・調達種別 |
| PartsMaster（実部品・在庫マスタ） | 実部品・在庫 | 実際に使う/交換する部品、在庫、価格、仕入先、対応条件 | `standardPartNameId`（標準部品名ID）, `gradeId`（部品グレードID）, `brandId`（時計ブランドID）, `modelId`（モデルID）, `caliberId`（実Cal ID）, `baseCaliberId`（ベースCal ID）, 価格, 在庫, 仕入情報, 写真 | 作業名本体、処置、帳票表示の確定値 | PartNameMaster（標準部品名）, PartGradeMaster（部品グレード）, BrandMaster（時計ブランド）, ModelMaster（モデル）, MovementCaliber（ムーブメントCal） | EstimateItem（見積スナップショット）, RepairLineItem（案件明細）の `partsMasterId`（実部品ID） | 部品検索・在庫・発注候補 | `partsMasterId`（実部品ID）はPART行用。LABOR行の `targetPartNameId`（作業対象部品名ID）と分ける |
| RepairWorkCategory（作業カテゴリマスタ） | 作業カテゴリ | 内装/外装の作業カテゴリ分類 | `repairType`（内装/外装）, `parentId`（親カテゴリID）, `name`（安定キー）, `displayName`（表示名）, `sortOrder`（表示順）, `isActive`（有効） | 部品在庫、価格、処置、帳票表示の確定値 | 親RepairWorkCategory（親作業カテゴリ） | RepairWorkName（標準作業名）, RepairLineItem（案件明細）, PricingRule（価格ルール） | 作業カテゴリ select | PartCategoryMaster（部品カテゴリ）と一致しない場合がある |
| RepairWorkAction（処置マスタ） | 処置 | 作業の処置大分類 | `name`（安定キー）, `displayName`（表示名）, `sortOrder`（表示順）, `isActive`（有効） | 細かい作業表現、部品名、価格 | なし | RepairWorkName（標準作業名）, RepairLineItem（案件明細）, PricingRule（価格ルール） | 処置 select | 原則15個から増やさず、細部は `detailLabel`（詳細）で受ける |
| RepairWorkName（標準作業名マスタ） | 標準作業名 | よく使う作業名の標準化・候補化 | `repairType`（内装/外装）, `categoryId`（作業カテゴリID）, `targetPartNameId`（作業対象部品名ID）, `actionId`（処置ID）, `detailLabel`（詳細）, `standardName`（標準作業名）, `b2bDisplayName`（B2B表示名）, `b2cDisplayName`（B2C表示名） | 価格ルール本体、在庫、帳票表示の過去確定値 | RepairWorkCategory（作業カテゴリ）, PartNameMaster（標準部品名）, RepairWorkAction（処置） | 将来のRepairLineItem（案件明細）入力補助, PricingRule（価格ルール） | 作業候補・補完候補 | 作業名候補であり、帳票・共有ページ・PublicCaseへ直接表示しない |
| RepairLineItem（案件明細本体） | 案件明細本体 | 通常Repairの正式な明細本体 | `lineType`（LABOR/PART）, `repairWorkCategoryId`（作業カテゴリID）, `repairWorkActionId`（処置ID）, `targetPartNameId`（作業対象部品名ID）, `partsMasterId`（実部品ID）, `pricingRuleId`（価格ルールID）, 表示名snapshot, 価格, 数量, メモ | マスタの現在値を後読みして表示する仕組み | Repair（修理案件）, PartsMaster（実部品・在庫）, PricingRule（価格ルール）, RepairWorkCategory（作業カテゴリ）, RepairWorkAction（処置）, PartNameMaster（標準部品名） | EstimateItem（見積スナップショット）, PublicCase（公開事例）生成元 | 修理明細入力・内部明細 | 帳票・共有ページ用表示名はsnapshotを使う |
| EstimateItem（見積スナップショット） | 見積スナップショット | 見積発行時点の明細snapshot | `itemName`（項目名）, `quantity`（数量）, `unitPrice`（単価）, `type`（part/labor）, `partsMasterId`（実部品ID） | 作業マスタ構造化field、現在のマスタ値 | Estimate（見積）, PartsMaster（実部品・在庫） | 帳票・共有ページ・既存見積表示 | 見積明細 | 発行時点のsnapshotとして扱い、RepairLineItemへ置換しきらない |
| PricingRule（価格ルール） | 価格ルール | 条件別価格・技術料候補価格・B2B/B2C価格差 | `brandId`（時計ブランドID）, `modelId`（モデルID）, `caliberId`（Cal ID）, `customerType`（顧客区分）, `minPrice`（最小価格）, `maxPrice`（最大価格）, `suggestedWorkName`（既存互換の作業名候補）, 作業構造field | 作業マスタ本体、部品在庫、帳票表示の確定値 | BrandMaster（時計ブランド）, ModelMaster（モデル）, MovementCaliber（ムーブメントCal）, RepairWorkCategory（作業カテゴリ）, RepairWorkAction（処置）, PartNameMaster（標準部品名） | RepairLineItem（案件明細） | 価格候補・自動入力候補 | 作業マスタ本体として使わない。手修正された最終価格は別途候補反映を検討 |
| PublicCase（公開事例） | 公開事例 | 公開用に整えた事例snapshot | ブランド/モデル/Ref/Cal表示, B2B/B2Cタイトル, サマリ, 公開状態, 金額表示方針, sourceSnapshot | Repair/EstimateItemの直表示、マスタ後読み表示 | Repair（修理案件）を任意参照 | PublicCaseWorkItem（公開事例作業項目）, PublicCasePartItem（公開事例部品項目）, PublicCaseImage（公開事例画像） | 公開事例一覧・詳細 | Repair側の確定明細snapshotから生成し、表示時にマスタを後読みしない |
| PublicCaseWorkItem（公開事例作業項目） | 公開事例作業項目 | 公開事例上の作業表示snapshot | `normalizedWorkName`（正規化作業名）, `b2bDisplayName`（B2B表示名）, `b2cDisplayName`（B2C表示名）, `laborPrice`（技術料）, `category`（カテゴリ）, `partName`（部品名）, `action`（処置）, `actionDetail`（処置詳細） | 作業マスタ本体、RepairLineItemの直表示 | PublicCase（公開事例） | PublicCasePartItem（公開事例部品項目） | 公開事例の作業欄 | 公開用に粗く/専門的に出し分ける |
| PublicCasePartItem（公開事例部品項目） | 公開事例部品項目 | 公開事例上の部品表示snapshot | `displayName`（表示名）, `price`（価格）, `relationStatus`（作業との関連状態）, `metadata`（補足情報） | PartsMasterの現在値、在庫、仕入先 | PublicCase（公開事例）, PublicCaseWorkItem（公開事例作業項目） | なし | 公開事例の部品欄 | 公開可否・表示粒度をRepair側とは別に管理する |

## FMP過去案件と新アプリ通常Repairの切り分け

FMP過去案件は過去データ救済用である。

```txt
FMP原文
→ FMP専用クリーニング
→ 作業マスタへの対応付け
→ PublicCase候補
```

FMP専用処理:

```txt
読み仮名削除
○○補正
表記ゆれ整理
複合作業分解
未紐づけPartItem救済
カテゴリ推定
brand-kana-approvedによるブランドカナ付与
コピー含有Case除外
```

新アプリ通常Repair:

```txt
内装修理 / 外装修理
→ カテゴリ
→ 部品名
→ 作業 / 処置
→ 詳細
→ 価格
→ RepairLineItem（案件明細本体）
→ EstimateItem（見積スナップショット）
→ PublicCase下書き
```

FMP専用クリーニングや推定を、新アプリ通常Repairへ持ち込まない。

## 今後やってはいけないこと

```txt
Calマスタを内装部品マスタとして扱う
PartsMasterを作業マスタとして扱う
PricingRuleを作業マスタ本体として扱う
PartNameMaster（標準部品名）と PartsMaster（実部品・在庫）を混同する
targetPartNameId（作業対象部品名ID）と partsMasterId（実部品ID）を混同する
RepairWorkAction（処置マスタ）を細かい作業表現で無制限に増やす
帳票・共有ページ・PublicCaseでマスタを直接後読み表示する
FMP過去案件の救済ルールを新アプリ通常Repairへ混ぜる
```

## 次Task案

```txt
Task 108-10N:
RepairWorkAction（処置マスタ）を15個方針へ更新するためのschema/seed影響確認を行う。

Task 108-10O:
PartNameMaster（標準部品名マスタ）へ「ムーブメント」を追加するためのseed差分を設計する。

Task 108-11:
作業カテゴリ別対象部品候補の実画面レビューを行い、静的マッピングからDB中間テーブルへ進むか判断する。
```

## 変更していないもの

このTaskでは以下を変更していない。

```txt
schema
migration
seed
DB
API
UI
RepairEntryForm
PricingRule
PartsMaster検索
getPartsMatched
PartsSearchPanel
帳票
PDF
LINE
共有ページ
PublicCase
```

