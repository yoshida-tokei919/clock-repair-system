# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書である。
過去Task履歴は残さず、現在有効な状態だけを書く。

## 現在Task

外装作業マスタ完成: external_labor（外装技術料）の処置表示分離と現行実装整合確認

## 目的

external_labor（外装技術料）を、内装作業と混在しない構造化入力として完成へ進める。

現在は外装LABOR入力、外装PricingRule（外装価格ルール）候補取得、外装PricingRule保存同期まで実装が進んでいる。

外装作業入力でRepairWorkAction（処置マスタ）が内外装混在表示される問題を解消し、内装作業の既存挙動が外装実装途中で変更されていないか確認する。

## 現在地

完了済み:

- 108-10AV: getExternalPricingRules（外装価格候補取得補助関数）実装
- 108-10AX: external_labor（外装技術料）入力UI実装
- 108-10AW: 外装PricingRule（外装価格ルール）保存同期実装

最新commit:

- `9a31f1f feat: sync external pricing rules`

ローカル未commit作業:

- 108-10AY
- `prisma/seed.ts`
- `src/components/repairs/RepairEntryForm.tsx`

108-10AYの内容:

- external_labor（外装技術料）選択時に作業分類欄を自動展開
- 既存外装部品カテゴリに対応するRepairWorkCategory（外装作業カテゴリ）6件をseedへ追加

外装作業カテゴリ:

- ケース・風防
- リューズ・チューブ
- プッシャー
- ベゼル
- 文字盤・針
- ブレス・バンド

DB確認済み情報:

- 外装作業カテゴリ: seed前0件、seed後6件
- 外装対象部品: 75件
- 有効な処置: 24件
- 外装PricingRule: 0件

## 確定事項

### 内装処置

内装作業で表示するRepairWorkAction（処置マスタ）は以下のみ。

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

外装作業で表示するRepairWorkAction（処置マスタ）は以下のみ。

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

RepairWorkAction（処置マスタ）は現行schema上でrepairType（内装/外装区分）を持たない。

RepairEntryForm（修理入力フォーム）は取得したrepairWorkActionOptions（処置候補）を内装/外装で分離せず表示している。

そのためexternal_labor（外装技術料）で内装専用処置を含む候補が混在する。

また、外装作業実装中に内装作業の表示・取得・保存挙動が意図せず変更されていないか確認が必要。

## 現在Taskの対象範囲

- `prisma/seed.ts` の108-10AY未commit差分確認
- `src/components/repairs/RepairEntryForm.tsx` の108-10AY未commit差分確認
- RepairWorkAction（処置マスタ）の内装/外装表示分離
- internal（内装作業）の既存挙動確認
- external_labor（外装技術料）の処置候補確認
- part_external（外装部品行）の既存挙動確認
- TypeScript検証

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

1. 108-10AY未commit差分を確認する
2. 内装処置14件、外装処置19件の確定定義に基づき表示分離方式を確認する
3. schema変更を行わず、現行RepairWorkAction（処置マスタ）のkeyを使ったUI表示分離が安全か確認する
4. 安全ならRepairEntryForm（修理入力フォーム）へ最小修正する
5. internal（内装）、external_labor（外装技術料）、part_external（外装部品行）の挙動を確認する
6. Task完了後、外装LABOR（外装技術料）とPricingRule（価格ルール）の取得・保存を画面操作で確認する

## 現在Taskの禁止事項

- RepairWorkAction（処置マスタ）を推測で追加しない
- RepairWorkCategory（作業カテゴリ）を推測で追加しない
- 内装/外装処置を混在表示しない
- targetPartNameId（対象部品名ID）をnumber（数値）へ変換しない
- PricingRule（価格ルール）保存条件を緩めない
- 現在Task対象外を変更しない
