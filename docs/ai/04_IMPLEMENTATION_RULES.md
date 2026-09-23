# IMPLEMENTATION RULES

## Production completion rule

コード変更を伴うTaskは、原則として以下の順で完了する。

実装
→ local実画面確認
→ commit
→ migration/env差分確認
→ production backup（migrationがある場合）
→ deploy
→ production smoke test
→ production commit/deployment記録
→ Task完了

`commit`だけではTask完了としない。

例外は以下に限る。

- investigation-only
- docs-only
- 明示的に次Taskと一体deployすると事前決定したTask

例外の場合は必ず `Production: pending` を明記する。

- 現在productionのcommitを常に記録する。
- production deploy成功時はproduction tagを作る。
- migrationがあるTaskはdeploy前backupを原則必須とする。
- Railwayへのdeploy sourceを明確化する。
- CLIから別系統を無記録でdeployしない。
- 旧release branchを名前だけでproduction sourceと判断しない。

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

## Supabase Data API / GRANT

2026年10月30日以降、Supabaseでは `public` schema（publicスキーマ）に新規作成したテーブルへData API用の権限が自動付与されない。

- schema / migrationで新規テーブルを作成する場合、Data APIから利用するか必ず確認する
- Data APIから利用する場合は、同じmigration内で必要な `GRANT`（権限付与）を明示する
- `anon`（未認証）、`authenticated`（認証済み）、`service_role`（サーバー権限）のどのroleへ何の権限が必要か用途ごとに判断する
- 全roleへ一律に `select, insert, update, delete` を付与しない
- サーバー内部専用などData API公開が不要なテーブルには不要なGRANTを付与しない
- `supabase db reset`、preview branch、新規projectでもmigrationのGRANT不足が影響するため、migration作成時点で確認する
- schema / migration / RLS / GRANT変更は高リスク変更として扱い、実装担当とレビュー担当を原則分離する

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

## AI実装担当の分業ルール

### 基本方針

- Codexの利用枠が使える間は、原則としてCodexを実装担当にする。
- ChatGPT（カタリ）は、要件整理、現状調査、影響範囲確認、Codex向け実装指示の作成、差分レビューを主担当とする。
- Desktop Commanderは、調査、ファイル確認、Git確認、コマンド実行、Codexへの指示受け渡しなどのオーケストレーションに使う。
- Codexの利用上限・rate limit等で実装継続ができない場合は、カタリが実装担当へ交代してよい。
- ユーザーが明示的にカタリ実装を指定した場合も、カタリが実装してよい。
- Codex枠が利用可能なのに、カタリが大規模実装まで恒常的に代行してChatGPT側の利用枠だけを消費しない。

### Codexが実装担当の場合

- 1 Taskの境界を守り、Task外のファイルや挙動を勝手に変更しない。
- 必要ファイルだけを読み、不要な全repo読み込みや大量コンテキスト消費を避ける。
- 最小差分で実装し、不要なリファクタリングを行わない。
- 実画面確認は原則ユーザー担当とし、CodexはTypeScript、lint、test、build、git diff --check等の静的・自動確認を担当する。
- schema / migration / auth / 決済 / 本番データに関わる高リスク変更は、実装担当とは別のレビュー役で確認する。Codex自身が実装した場合、同じ実装セッションの自己レビューだけで完了扱いにしない。
- commitは原則1 Task = 1 commitとし、Task外の差分を混ぜない。
- production migration、deploy、破壊的操作、不可逆操作はユーザーの明示承認なしに実行しない。

### カタリが実装担当へ交代した場合

- Codexと同じTask境界、最小差分、静的確認、実画面確認の役割分担を守る。
- 実装前にgit statusと対象差分を確認し、既存の未commit変更をTask外として保護する。
- 自分が書いたコードを、自分のレビューだけで「問題なし」として次の高リスク工程へ進めない。
- 可能ならCodexまたは別の独立したレビュー役をread-onlyで使い、実装担当と最終レビュー役を分離する。
- Codex利用枠切れ等で独立レビューができない場合は、型チェック・test・build・diff確認までは行ってよいが、「独立レビュー未実施」を明示する。
- 独立レビュー未実施のまま、schema migration適用、production DB変更、deploy、認証・決済設定変更などの高リスク工程へ自動で進まない。必ずユーザー承認ポイントで止める。
- カタリ実装時も、1 Task = 1 commitを原則とし、ユーザー承認前に勝手に複数Taskを連続実装しない。

### レビューと進行の原則

- 「実装した本人が確認したからOK」だけでTaskを閉じない。
- 実装者とレビュー役は、特に高リスク変更では原則分離する。
- レビューで指摘が出た場合は、修正後に必要な確認を再実行する。
- 本番反映前には、変更内容、確認結果、未確認事項、productionで実行する操作をユーザーへ明示する。
- レビュー完了や自動テスト成功は、本番変更の自動承認を意味しない。
