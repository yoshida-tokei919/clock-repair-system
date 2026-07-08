# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書である。
過去Task履歴は残さず、現在有効な状態だけを書く。

## 現在Task

外装作業マスタ最終確認: external_labor（外装技術料）とPricingRule（価格ルール）の取得・保存・再表示確認

## 目的

external_labor（外装技術料）を実運用前の最小完成状態へ近づける。

内装/外装の処置表示分離は完了済み。次は外装LABOR（外装技術料）で作成した明細が、保存後もRepairLineItem（修理明細）とPricingRule（価格ルール）に正しく反映され、次回以降の候補表示に使えるかを確認する。

## 現在地

完了済み:

- 108-10AV: getExternalPricingRules（外装価格候補取得補助関数）実装
- 108-10AX: external_labor（外装技術料）入力UI実装
- 108-10AW: 外装PricingRule（外装価格ルール）保存同期実装
- 108-10AY: external_labor（外装技術料）選択時の作業分類欄自動展開、外装作業カテゴリ6件追加
- 108-10AZ: RepairWorkAction（処置マスタ）の内装/外装表示分離

最新commit:

- `d754b09 fix: separate internal and external work actions`

画面確認済み:

- external_labor（外装技術料）で外装処置19件のみ表示
- internal（内装）で内装処置14件のみ表示
- 外装カテゴリ6件と対象部品が表示
- 外装LABOR（外装技術料）を保存するとPricingRule（価格ルール）に反映

## 確定事項

### 内装処置

internal（内装作業）で表示するRepairWorkAction（処置マスタ）は以下のみ。

- 交換
- 修理
- 調整
- 修正
- 研磨
- 洗浄
- 注油
- 製作
- 取付
- 除去
- 穴締め
- かしめ
- オーバーホール
- 検査

### 外装処置

external_labor（外装技術料）で表示するRepairWorkAction（処置マスタ）は以下のみ。

- 交換
- 取付
- 修理
- 修正
- 調整
- 加工
- 製作
- 接着
- 研磨
- 仕上げ
- 簡易仕上げ
- 洗浄
- 検査
- 塗装
- サビ取り
- 乾燥
- 除去
- 溶接
- ロウ付け

内装処置と外装処置を一緒に表示してはならない。

### 外装LABOR

external_labor（外装技術料）:

- lineType（明細行種別）= LABOR
- PricingRule（価格ルール）保存対象
- PartsMaster（実部品・在庫マスタ）は使わない
- targetPartNameId（対象部品名ID）はPartNameMaster（標準部品名マスタ）由来

外装PricingRule（外装価格ルール）は以下を使用する。

- customerType（顧客区分）
- brandId（ブランドID）
- modelId（モデルID）
- targetPartNameId（対象部品名ID）
- repairWorkActionId（処置ID）

外装では caliberId（Cal ID）を使わない。

### 外装PART

part_external（外装部品行）:

- lineType（明細行種別）= PART
- PartsMaster（実部品・在庫マスタ）検索/発注/在庫対象
- PricingRule（価格ルール）保存対象外

## 現在の問題

外装LABOR（外装技術料）の基本入力と処置分離は確認済み。

次に、保存済み外装PricingRule（外装価格ルール）が次回以降の同条件入力で候補表示されるか、編集画面でRepairLineItem（修理明細）のsnapshot（保存時点表示値）が崩れないかを確認する必要がある。

## 現在Taskの対象範囲

- external_labor（外装技術料）の新規保存確認
- 保存済み外装PricingRule（外装価格ルール）の候補再表示確認
- modelId（モデルID）あり候補とmodelId=null（モデル共通候補）の優先確認
- customerType（顧客区分）business / individual の分離確認
- 編集画面で外装LABOR（外装技術料）の表示が崩れないか確認
- internal（内装作業）の既存挙動が維持されているか確認
- part_external（外装部品行）がPricingRule（価格ルール）保存対象外であることの確認

## 対象外

- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase（公開事例）
- 顧客コメント
- 部品マスタ再設計
- 部品検索ワード生成
- QRタグ
- 作業優先順位
- スケジュール

## 次の作業

1. 外装LABOR（外装技術料）を複数条件で保存する
2. 同条件で外装PricingRule（外装価格ルール）候補が再表示されるか確認する
3. customerType（顧客区分）違いで候補が混ざらないか確認する
4. modelId（モデルID）あり候補がmodelId=null（モデル共通候補）より優先されるか確認する
5. 編集画面で既存外装LABOR（外装技術料）の表示が崩れないか確認する
6. 問題なければPhase 1（作業マスタ）を一旦完了扱いにし、Phase 2（部品マスタ・部品検索・発注連携）へ進む

## 現在Taskの禁止事項

- RepairWorkAction（処置マスタ）を推測で追加しない
- RepairWorkCategory（作業カテゴリ）を推測で追加しない
- 内装/外装処置を混在表示しない
- targetPartNameId（対象部品名ID）をnumber（数値）へ変換しない
- PricingRule（価格ルール）保存条件を緩めない
- 現在Task対象外を変更しない
