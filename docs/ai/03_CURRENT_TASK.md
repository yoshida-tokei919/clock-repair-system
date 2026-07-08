# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書である。
過去Task履歴は残さず、現在有効な状態だけを書く。

## 現在Task

Phase 2開始: 内装部品マスタの差分確定と不足部品追加準備

## 目的

PartCategoryMaster（標準部品カテゴリ）とPartNameMaster（標準部品名マスタ）の内装部品定義を、時計修理実務上の正しい内装部品マスタへ整理する。

既存の内装作業マスタは原則変更しない。
作業マスタと部品マスタを混同せず、内装部品マスタの確定差分だけを最小修正する。

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

- src/lib/part-input-options.ts の内装部品名候補への追加
- scripts/seed-part-standard-masters.ts の既存安全性確認
- prisma/schema.prisma の変更なし確認
- seed実行によるPartNameMaster（標準部品名マスタ）反映確認
- 内装部品候補取得で追加部品が表示されるか確認

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
- RepairWorkAction（処置マスタ）
- RepairWorkCategory（作業カテゴリ）
- PricingRule（価格ルール）

## 次の作業

1. 追加部品のkey（キー）、日本語名、英語名、categoryKey（カテゴリキー）、movementTarget（ムーブメント対象）、movementPosition（上下位置）を確定する
2. Codexへ最小実装Taskを渡す
3. `src/lib/part-input-options.ts` のみを中心に追加する
4. seedを実行して重複・categoryKey不整合・partType不整合がないか確認する
5. TypeScript検証を行う
6. 画面または取得処理で内装部品候補に追加部品が出るか確認する

## 現在Taskの禁止事項

- PartNameMaster（標準部品名マスタ）を推測で追加しない
- PartCategoryMaster（標準部品カテゴリ）を推測で追加しない
- 部品マスタと作業マスタを混同しない
- 内装/外装部品を混在させない
- RepairWorkAction（処置マスタ）を変更しない
- RepairWorkCategory（作業カテゴリ）を変更しない
- PricingRule（価格ルール）の条件を変更しない
- train_wheel（輪列）側のfifth_wheel（五番車）を削除しない
- 五番耐震穴石座を追加しない
- 汎用 受石 / 汎用 穴石を追加しない
- 現在Task対象外を変更しない
