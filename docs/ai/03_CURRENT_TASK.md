# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書である。
過去Task履歴は残さず、現在有効な状態だけを書く。

## 現在Task

Phase 2開始: 内装部品マスタの差分確定と部品用語マスタ設計

## 目的

PartCategoryMaster（標準部品カテゴリ）とPartNameMaster（標準部品名マスタ）の内装部品定義を、時計修理実務上の正しい内装部品マスタへ整理する。

既存の内装作業マスタは原則変更しない。
作業マスタと部品マスタを混同せず、内装部品マスタの確定差分だけを最小修正する。

部品検索・海外部品調達に使う英語/フランス語/ドイツ語などの部品表記は、PartNameMaster（標準部品名マスタ）へ直接ベタ持ちせず、PartNameTerm（部品用語マスタ）として分離する方向で設計する。

## 現在地

Phase 1（作業マスタ）は一旦完了。

確認済み:

- internal（内装作業）を構造化入力できる
- external_labor（外装技術料）を構造化入力できる
- internal（内装）とexternal_labor（外装技術料）の処置候補は分離されている
- external_labor（外装技術料）とpart_external（外装部品行）は分離されている
- 外装PricingRule（外装価格ルール）は保存後、同条件で候補再表示される
- customerType（顧客区分）business / individual の候補は混在しない
- modelId（モデルID）あり候補はmodelId=null（モデル共通候補）より優先される
- 編集画面で保存済み外装LABOR（外装技術料）の表示は維持される
- part_external（外装部品行）はPricingRule（価格ルール）へ学習されない

最新の作業マスタ実装commit:

- `d754b09 fix: separate internal and external work actions`

内装部品マスタ差分調査は完了。
現行アプリと正本資料の差分について、以下の扱いを確定済み。

既存の部品検索・検索ワード生成実装はある程度存在する。
PC環境に戻った後、CousinsUK PDF、ETA多言語資料、その他部品表資料を投入し、既存検索実装と照合しながらPartNameTerm（部品用語マスタ）設計へ接続する。

## 内装部品マスタの設計前提

### 部品マスタと作業マスタは別物

PartNameMaster（標準部品名マスタ）:

- 対象部品名の標準マスタ
- 内装部品名の候補定義に使用する
- 作業入力ではtargetPartNameId（対象部品名ID）として参照される場合がある
- 日本語標準名と内部識別を中心に持つ
- 海外部品検索用の全表記を直接抱え込まない

PartsMaster（実部品・在庫マスタ）:

- 実部品
- 在庫
- 仕入
- 価格
- 写真
- 発注
- 部品検索

PartNameTerm（部品用語マスタ）:

- PartNameMaster（標準部品名マスタ）に紐づく検索・多言語・出典別の部品表記を管理する
- 英語、フランス語、ドイツ語などを扱う
- CousinsUK、ETA、Jules Borel、Esslinger、メーカー資料、販売サイトなどの出典を持てるようにする
- 検索ワード生成の主材料にする

RepairWorkName（作業名マスタ）やRepairWorkAction（処置マスタ）とは別物として扱う。

### 内装部品の軸

内装部品はmovementCaliber（ムーブメントCal）中心で扱う。

必要な場合はbaseMovementCaliber（ベースCal）をfallback（代替検索）として使用する。
watch.caliber（時計登録Cal）は既存設計との整合を確認して扱う。

brandId（ブランドID）を内装部品の主軸にしない。

## 部品用語マスタの設計前提

PartNameTerm（部品用語マスタ）は、PartNameMaster（標準部品名マスタ）1件に対して複数持てる。

想定フィールド:

- partNameId（標準部品名ID）
- language（言語）: ja / en / fr / de など
- term（用語）
- normalizedTerm（正規化用語）
- termType（用語種別）: primary / official / supplier / alias / search など
- source（出典）: ETA / CousinsUK / JulesBorel / Esslinger / generic など
- manufacturer（メーカー）: ETA / Sellita / Seiko など
- sourceDocumentId（出典資料ID）
- sourcePage（出典ページ）
- priority（優先順位）
- isActive（有効フラグ）

英語表記は直訳ではなく、実際の部品表・販売サイト・メーカー資料で使われる表記を優先する。

英語以外のフランス語・ドイツ語は後からデータ投入で追加できる構造にする。
schema（DB構造）は多言語を前提にする。

## 検索ワード生成の設計前提

検索ワード生成は、PartNameMaster（標準部品名マスタ）のnameEn（英語名）だけに依存させない。

検索ワード生成では以下を組み合わせる。

- movementMaker（ムーブメントメーカー）
- movementCaliber（ムーブメントCal）
- baseMovementCaliber（ベースCal）
- brand（時計ブランド）※外装部品中心
- model（モデル）※外装部品中心
- partRef（部品Ref）
- PartNameTerm（部品用語マスタ）のterm（用語）
- supplier（仕入先）ごとの検索方針
- language（言語）ごとの検索方針

サイト別に検索言語・検索語の優先順位を変えられるようにする。

例:

- CousinsUK: 英語表記優先
- ETA資料由来: ETA公式表記を優先
- フランス系部品サイト: フランス語表記を優先
- ドイツ系部品サイト: ドイツ語表記を優先

## PDF資料の扱い

PC環境復帰後に以下を投入し、用語抽出とマッピングを行う。

- CousinsUK PDF資料
- ETA多言語解説・部品表PDF
- 必要に応じてJules Borel、Esslinger、その他販売サイト資料

PDFから抽出した用語は、PartNameMaster（標準部品名マスタ）へ直接入れず、PartNameTerm（部品用語マスタ）候補として扱う。

PDFから抽出した用語は出典を残す。

## 既存検索実装の確認対象

PC環境復帰後、以下を確認する。

- src/components/parts/PartsSearchPanel.tsx
- src/components/parts/PartsWebSearchPanel.tsx
- src/app/api/parts/search/route.ts
- src/app/parts-sourcing/page.tsx
- docs/ai-tasks/006-design-parts-search-to-order-flow.md
- docs/ai-tasks/020-investigate-web-search-area-for-parts-panel.md
- docs/ai-tasks/021-create-parts-web-search-panel-shell.md
- docs/ai-tasks/022-enable-web-search-sites-in-parts-web-search-panel.md
- docs/ai-tasks/036-design-parts-search-standard-master-integration.md

既存検索実装を壊さず、段階的にPartNameTerm（部品用語マスタ）へ接続する。

## 確定した正本反映方針

### 正本資料をアプリ側に合わせるもの

以下は現行アプリ側を正として、正本資料へ反映する扱いとする。

- quartz（クォーツ）カテゴリkey
- main_plate（地板）カテゴリkey
- movement（ムーブメント）カテゴリを正式カテゴリとして残す
- escape_wheel（ガンギ車）keyを正式扱いにする
- 電池系部品
- 曜送り系部品
- ローター真系部品

### アプリへ追加するもの

train_wheel（輪列）へ追加する。

- 秒カナ受け
- 秒カナ受けネジ
- 秒カナ押さえ
- 秒カナ押さえネジ

quartz（クォーツ）へ追加する。

- 五番受石（上）
- 五番受石（下）

train_wheel（輪列）へ追加する耐震系。

- 三番耐震穴石（上）
- 三番耐震穴石（下）
- 三番耐震受石（上）
- 三番耐震受石（下）
- 三番耐震バネ（上）
- 三番耐震バネ（下）
- 四番耐震穴石（上）
- 四番耐震穴石（下）
- 四番耐震受石（上）
- 四番耐震受石（下）
- 四番耐震バネ（上）
- 四番耐震バネ（下）

quartz（クォーツ）へ追加する五番耐震系。

- 五番耐震穴石（上）
- 五番耐震穴石（下）
- 五番耐震受石（上）
- 五番耐震受石（下）
- 五番耐震バネ（上）
- 五番耐震バネ（下）

### 追加しないもの

以下は不要。

- 汎用 受石
- 汎用 穴石
- 五番耐震穴石座

## 五番車の扱い

fifth_wheel_quartz（クォーツ五番車）を正式な通常使用対象とする。

train_wheel（輪列）側の既存 fifth_wheel（五番車）は新規利用対象にしない。
ただし、ごく稀に機械式五番車が存在するため、既存定義がある場合は削除しない。

五番車の耐震系はquartz（クォーツ）カテゴリに置く。
五番耐震穴石座は作らない。

耐震穴石、穴石、耐震穴石座は別物として扱う。

## 現在Taskの対象範囲

- 部品マスタ要件整理
- PartNameTerm（部品用語マスタ）設計
- 既存部品検索実装の調査
- PDF資料投入後の用語抽出方針整理
- src/lib/part-input-options.ts の内装部品名候補への追加準備
- scripts/seed-part-standard-masters.ts の既存安全性確認
- prisma/schema.prisma の変更要否確認
- seed実行によるPartNameMaster（標準部品名マスタ）反映確認
- 内装部品候補取得で追加部品が表示されるか確認

## 対象外

- 外装部品マスタの本実装
- QRタグ
- 作業可能判定
- 作業優先順位
- スケジュール
- 事例公開
- 帳票
- PDF
- LINE
- 共有ページ
- 顧客コメント
- RepairWorkAction（処置マスタ）
- RepairWorkCategory（作業カテゴリ）
- PricingRule（価格ルール）

## 次の作業

1. 既存の部品検索・検索ワード生成実装を確認する
2. PartNameTerm（部品用語マスタ）のschema案を作る
3. PDF投入後の用語抽出・出典管理フローを設計する
4. 追加部品のkey（キー）、日本語名、英語代表名、検索別名、多言語別名、categoryKey（カテゴリキー）、movementTarget（ムーブメント対象）、movementPosition（上下位置）を確定する
5. Codexへ調査Taskを渡す
6. 必要に応じてschema変更または暫定static定義を選ぶ
7. `src/lib/part-input-options.ts` のみを中心に追加する場合は、PartNameTerm（部品用語マスタ）設計と矛盾しないようにする
8. seedを実行して重複・categoryKey不整合・partType不整合がないか確認する
9. TypeScript検証を行う
10. 画面または取得処理で内装部品候補に追加部品が出るか確認する

## 現在Taskの禁止事項

- PartNameMaster（標準部品名マスタ）を推測で追加しない
- PartCategoryMaster（標準部品カテゴリ）を推測で追加しない
- 英語表記を直訳だけで確定しない
- PDFや出典資料の用語を出典なしで確定語として扱わない
- 部品マスタと作業マスタを混同しない
- 内装/外装部品を混在させない
- RepairWorkAction（処置マスタ）を変更しない
- RepairWorkCategory（作業カテゴリ）を変更しない
- PricingRule（価格ルール）の条件を変更しない
- 既存検索実装を確認せず検索ロジックを作り替えない
- train_wheel（輪列）側のfifth_wheel（五番車）を削除しない
- 五番耐震穴石座を追加しない
- 汎用 受石 / 汎用 穴石を追加しない
- 現在Task対象外を変更しない
