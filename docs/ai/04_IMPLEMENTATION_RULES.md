# IMPLEMENTATION RULES

このファイルは、Codex等の実装担当AIが時計修理業務アプリで常時守る共通ルールを定義する。

## 作業開始

実装・調査前に必ず以下を読む。

1. `docs/ai/04_IMPLEMENTATION_RULES.md`
2. `docs/ai/03_CURRENT_TASK.md`

Task指示で指定されたschema（DB定義）、seed（初期データ）、docs、現行実装も確認する。

## Task境界

- 現在Task対象外を変更しない
- 調査Taskでは、明示的に許可されない限り実装しない
- schema変更はTaskで明示された場合のみ行う
- commit禁止と指定されたTaskではcommitしない
- 正本と現行実装にTask対象外の差分を発見した場合、勝手に修正せず報告する

以下は対象Taskでない限り変更しない。

- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase（公開事例）
- 顧客コメント

## マスタ設計

- 部品マスタと作業マスタを混同しない
- 内装と外装を混ぜない
- RepairWorkAction（処置マスタ）を推測で追加しない
- RepairWorkCategory（作業カテゴリ）を推測で追加しない
- PartNameMaster（標準部品名マスタ）の部品名を推測で追加しない
- 既存定義を確認せず内装/外装を分類しない
- 「外装なら使えそう」「内装でも使えそう」という推測で候補を作らない

## 部品マスタと作業マスタ

PartNameMaster（標準部品名マスタ）は対象部品名の標準マスタである。

PartsMaster（実部品・在庫マスタ）は実部品、在庫、仕入、価格、写真、発注用である。

external_labor（外装技術料）では targetPartNameId（対象部品名ID）としてPartNameMaster（標準部品名マスタ）を参照する。
PartsMaster（実部品・在庫マスタ）は使わない。

part_external（外装部品行）はPartsMaster（実部品・在庫マスタ）の検索、発注、在庫対象である。
PricingRule（価格ルール）保存対象外である。

## 内装作業

内装はmovementCaliber（ムーブメントCal）中心で扱う。

価格候補取得は既存方針を維持する。

1. movementCaliber（ムーブメントCal）
2. baseMovementCaliber（ベースCal）
3. watch.caliber（時計登録Cal）

内装作業の処置は以下のみ。

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

## 外装作業

外装LABOR（外装技術料）は以下を使用する。

- brandId（ブランドID）
- modelId（モデルID）
- targetPartNameId（対象部品名ID）
- repairWorkActionId（処置ID）
- detailLabel（詳細ラベル）

外装LABORでは caliberId（Cal ID）を使わない。

外装作業の処置は以下のみ。

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

## RepairLineItem

external_labor（外装技術料）:

- lineType（明細行種別）= LABOR
- PricingRule（価格ルール）保存対象
- PartsMaster（実部品・在庫マスタ）は使わない

part_external（外装部品行）:

- lineType（明細行種別）= PART
- PartsMaster（実部品・在庫マスタ）検索/発注/在庫対象
- PricingRule（価格ルール）保存対象外

sourceCategory（明細追加元カテゴリ）はRepairLineItemInput（修理明細入力）の一時フィールドである。
現行RepairLineItem（修理明細）テーブルには保存列がない。

## PricingRule

customerType（顧客区分）は必須であり、以下のみ使用する。

- business（B2B）
- individual（B2C）

以下は禁止する。

- customerType=null
- generic
- unclassified
- business / individual 以外の顧客区分

外装PricingRule（外装価格ルール）の保存条件:

- lineType（明細行種別）= LABOR
- customerType（顧客区分）がbusinessまたはindividual
- brandId（ブランドID）必須
- targetPartNameId（対象部品名ID）必須
- repairWorkActionId（処置ID）必須
- suggestedWorkName（候補作業名）必須
- unitPrice（単価） > 0

外装PricingRuleでは caliberId（Cal ID）= null、repairWorkNameId（作業名ID）= null とする。

## 型に関する固定事項

targetPartNameId（対象部品名ID）は現行schemaでstring（文字列）である。
number（数値）へ変換しない。

## 不明点

既存定義、正本文書、schema、seed、現行実装から安全に判断できない場合は修正しない。

推測によるマスタ追加、分類、業務ルール変更は禁止する。
調査結果として不明点を明示する。
