# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書である。
過去Task履歴は残さず、現在有効な状態だけを書く。

## 現在Task

Phase 2開始: 内装部品マスタの現行定義・実装・正本差分確認

## 目的

PartCategoryMaster（標準部品カテゴリ）とPartNameMaster（標準部品名マスタ）の内装部品定義を確認し、時計修理実務上の正しい内装部品マスタへ整理する。

既存の内装作業マスタは原則変更しない。
作業マスタと部品マスタを混同せず、内装部品マスタの差分確認から開始する。

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

## 内装部品マスタの設計前提

### 部品マスタと作業マスタは別物

PartNameMaster（標準部品名マスタ）:

- 対象部品名の標準マスタ
- 内装部品名の候補定義に使用する
- 作業入力ではtargetPartNameId（対象部品名ID）として参照される場合がある

PartsMaster（実部品・在庫マスタ）:

- 実部品
- 在庫
- 仕入
- 価格
- 写真
- 発注
- 部品検索

RepairWorkName（作業名マスタ）やRepairWorkAction（処置マスタ）とは別物として扱う。

### 内装部品の軸

内装部品はmovementCaliber（ムーブメントCal）中心で扱う。

必要な場合はbaseMovementCaliber（ベースCal）をfallback（代替検索）として使用する。
watch.caliber（時計登録Cal）は既存設計との整合を確認して扱う。

brandId（ブランドID）を内装部品の主軸にしない。

## 現在Taskの対象範囲

- PartCategoryMaster（標準部品カテゴリ）の内装カテゴリ定義確認
- PartNameMaster（標準部品名マスタ）の内装部品名定義確認
- prisma/schema.prisma の関連model確認
- prisma/seed.ts と関連seed/helper（補助処理）の確認
- src/lib/part-input-options.ts の現行定義確認
- 内装部品候補取得処理の確認
- Notionにある内装部品カテゴリー・部品名資料との照合
- docs/ai-tasks 配下の内装部品関連Taskは必要な過去経緯の確認時のみ参照

## 今回最初に確認する差分

1. 正本資料の内装部品カテゴリ一覧
2. 現行seedの内装PartCategoryMaster（標準部品カテゴリ）
3. 正本資料の内装部品名一覧
4. 現行seedの内装PartNameMaster（標準部品名マスタ）
5. 不足項目
6. 余剰項目
7. 表記差
8. categoryKey（カテゴリキー）紐付け差
9. partType（部品種別）差
10. 外装部品定義が内装候補へ混在していないか

## 方針

- 正本資料に記載された内装カテゴリ・内装部品名を優先する
- 推測で部品名を追加しない
- 推測でカテゴリを追加しない
- 不明な差分はユーザーへ確認する
- 現在の内装作業マスタは原則変更しない
- 外装作業マスタは変更しない
- 差分は一つずつ確認し、正本資料修正またはアプリ修正を判断する

## 対象外

- 外装部品マスタの本実装
- 部品検索ワード生成修正
- 複数サイト検索
- 通貨変換
- 価格クリック挿入
- 発注管理連携
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

## 次の作業

1. Notionの内装部品カテゴリー・部品名資料を確認する
2. 現行schema・seed・part-input-options・候補取得処理を確認する
3. 正本資料と現行アプリの差分表を作る
4. 差分をユーザーと一つずつ確認する
5. 確定した差分のみ最小修正する

## 現在Taskの禁止事項

- PartNameMaster（標準部品名マスタ）を推測で追加しない
- PartCategoryMaster（標準部品カテゴリ）を推測で追加しない
- 部品マスタと作業マスタを混同しない
- 内装/外装部品を混在させない
- RepairWorkAction（処置マスタ）を変更しない
- RepairWorkCategory（作業カテゴリ）を変更しない
- PricingRule（価格ルール）の条件を変更しない
- 現在Task対象外を変更しない
