# Business app recovery — 2026-09-05

## 完了状態

ローカル `recovery/business-app-post-publiccase-20260905` を作成した。
release切替直前の業務アプリ全体を基点に、PublicCase production互換とTask135を統合した。
本番deploy・本番migration・本番DDL/DML・FMP更新・Admin変更・promotion・reimport・db push・Playwrightは実行していない。
本番DBへの操作は、明示許可されたread-only pg_dumpのみ。

## 1. 正確な復旧元

`1ba89f43b329bc8dba678ac4618489d8b2fad782`

HEAD reflog:

- 2026-09-04 18:50:43 JST: `1ba89f4` commit
- 2026-09-04 18:53:47 JST: `wip-publiccase-workmaster-20260606` から `release/publiccase-production` へcheckout、移動先は `db48b49`

`d754b09`、`d5b856a`、`6543a54`、`19497f9` はいずれも復旧元の祖先として確認した。
古いreleaseを基点に業務コードを手移植する方法は使っていない。

## 2. local-only commits / remote確認

切替直前の追跡remoteは `d754b09`。次の4件は実remoteを再fetchした後もlocal-onlyだった。

| Commit | 内容 |
|---|---|
| `6543a546e6299fc3e9d30a655cfacb7fc979c77a` | Tasks110–116、部品検索・PartsMaster成長・grade別重複防止 |
| `19497f958aa1869f0f7b13e6695c17a31bdcde03` | PublicCaseレビュー・B2C公開 |
| `5cc14f9e0c29bae3ba74f4177a3200b6a00f0a0e` | production切替準備記録 |
| `1ba89f43b329bc8dba678ac4618489d8b2fad782` | production importer / promotion / migration資産 |

実remote HEADは `4e08ae72bb37d3695f6751bd656063844715d80e` だった。
remote側の14件は `docs/ai/02_PRODUCT_ROADMAP.md` と `docs/ai/03_CURRENT_TASK.md` だけの更新で、業務コード・schema変更はゼロ。
復旧元の優先順位に従い、切替直前のコード・文書を保持した。remoteの別系統ロードマップは混ぜていない。
remote mainは `db48b493fc16b4ceab02bf162c06b781368800ad`。pushは行っていない。

## 3–4. 切替時の未commit差分とsession再構成

切替時の未commit業務差分は **なし**。再構成が必要な未commitコードはなかった。

根拠session:

- `C:/Users/yoshi/.codex/sessions/2026/09/04/rollout-2026-09-04T18-05-04-01a06baa-18c0-7a21-8d47-bd1ad9c9b289.jsonl`
- `C:/Users/yoshi/.codex/sessions/2026/09/04/rollout-2026-09-04T18-52-04-01a06bd5-1d0b-7f53-b14d-de3b65c67539.jsonl`

18:50:43のcommit直後の `git status --short` は空。
18:52:17の `git status --short --branch` もbranch情報とahead 4のみで、変更行はない。
18:53:47の切替後の差分は、そのコマンドが明示的にrestoreしたPublicCase資産であり、未commit業務コードの取り残しではない。
切替直前のhandback・commit・差分記録とreflogの順序が一致している。

## 5. 復旧した業務機能

| 範囲 | 復旧内容・根拠 |
|---|---|
| Repair画面 | `RepairEntryForm.tsx`を復旧元から全体復元。新規/既存入力、ステータス、顧客・時計情報、Movement Cal / Base Cal、共有メッセージ等を保持 |
| 構造化明細 | `RepairLineItem`、WorkCategory / Action / Name、stringのtargetPartNameId、保存・再読込アダプタ、transaction内dual write |
| PricingRule | 内装/外装の分離、B2B/B2C、構造化条件保存・取得、外装Calなし。既存`pricing-rules.ts`と`master-actions.ts`を復旧元と同一内容で保持 |
| Cal取得 | movementCaliber → baseMovementCaliber → watch.caliber → Calなしの既存候補選択・snapshot経路 |
| PartsMaster | 内装movement軸/外装watch brand軸、grade-aware重複防止、純正/FIT/合わせ/中古、partRef trim-only、対象部品名IDと実部品IDの分離 |
| 部品Web検索 | site profile、partName/partRef/both、localStorage saved defaults、bulk popup、Cousins URL修正、PartsSearchPanel、検索情報追記・成長preview/commit |
| 在庫・発注 | 復旧元の在庫不足確認、発注依頼、数量・ステータス連携を保持 |

参照: Tasks107系、108系、110-1〜110-7、113〜116、`docs/MASTER_WORK_REPAIR_PRICING_CURRENT_GUIDE.md`、schema・seed・実コード。
作業マスタの定義・seed・部品検索/重複判定実装に新しい業務ルールは追加していない。

## 6. PublicCase production統合

- B2C gallery/detail、homepage導線、WEB_APP draft/editor、写真選択、publish/unpublish、重複防止を保持。
- gallery・homepage・editor・`public-cases.ts`・production importer・promotion scriptは、復旧元とreleaseに同一内容で存在していることを確認。
- `RepairLineItem`がある案件ではその構造化snapshotを正本にし、存在しないlegacy案件ではTask125のEstimateItem snapshotからdraftを生成。
- 外装LABORにWorkCategory参照がない場合も、保存済みsourceAreaSnapshotを使用する。
- 未登録部品のsnapshotもlegacy経路で失わず、価格公開フラグはfalse、初期状態はDRAFT/HIDDEN。
- EstimateItemの7列を最終schemaへ追加し、Repair POST/PATCHでdual writeと同時に保存。
- 再読込で既存snapshotをnullに置き換えず、B2C表示名・grade・内外装区分も保持する。
- release専用の自由記入マスタ代替UIは重複追加せず、復旧した構造化入力を使用。

## 7. Task135

最初の状態: release `06e680d61744f024b72c34358c467bb04d00216d`、対象3ファイルのみ変更、staged差分なし。
repo外patch: `C:/Users/yoshi/AppData/Local/Temp/clock-recovery-20260905/task135.patch`（12,365 bytes）。
safety branch: `safety/task135-pre-recovery-20260905`。

保全commitからcherry-pickし、競合なく適用した。
4K/16:9優先、videoWidth/videoHeight基準、縮小なし、1MB圧縮なし、WebP/JPEG 92%、入力/映像/保存解像度表示、detail原画像比率を維持。
保存機能はそのままに、旧2560px/80%を説明していた古いコメントだけを整合させた。
実カメラ機器の撮影・目視確認は未実施。

## 8. 最終schemaとmigration

active migrationは以下2本のみ。releaseのSQLと差分ゼロで、checksumを変えていない。

1. `0_production_legacy_baseline`
2. `20260904_add_estimate_item_public_case_snapshots`

WIP時代のmigrationは `prisma/migrations_archive/` に保持。
`20260611_add_structured_work_fields` と `20260619_add_pricing_rule_work_name` もarchiveへ移し、activeには戻していない。

最終schemaは復旧元の業務モデル全部 + 既存PublicCaseモデル + EstimateItem snapshot 7列。
現在の本番dumpを復元したDBとのPrisma diff結果:

```sql
-- This is an empty migration.
```

したがって **新しいforward migrationは不要**。重複CREATEや不要な3本目のmigrationは作成していない。

## 9. disposable PostgreSQL 17検証

コンテナ: `clock-recovery-20260905`、接続は `127.0.0.1:55435` のみ。

旧Task131 dump（154,247 bytes）を `clock_recovery` に復元。
これはFMP移行前・migration履歴登録前だった。baseline登録と既存snapshot migration適用をこの使い捨てDBだけで検証し、schema差分ゼロを確認した。

現在状態検証のため、確認済みRailway production接続設定を秘密値非表示で取得。
`PGOPTIONS=-c default_transaction_read_only=on` を指定したPostgreSQL 17のpg_dumpでpublic schema+dataを取得した。

- dump: `C:/Users/yoshi/AppData/Local/Temp/clock-recovery-20260905/production-current.backup`
- size: 592,734 bytes
- SHA256: `C9001D29935C0B3C88E971FD12E2D8875FC8D8E94991AC9F796B7260ED703FC7`

別の空DB `clock_recovery_current` に復元。空DBに最初からあるpublic schemaのCREATEだけを復元リストから除外した。

| 検証 | 結果 |
|---|---|
| migration履歴 | 指定2本が完了済み |
| migrate status | Database schema is up to date |
| schema diff --exit-code | 0、差分ゼロ |
| disposable migrate deploy | No pending migrations to apply |
| PublicCase | 2,914件 |
| FMP / WEB_APP | 2,914 / 0 |
| FMP全件の公開条件 | APPROVED、B2C PUBLISHED、B2B HIDDEN、showPriceB2c=false |
| gallery/detail/home取得 | 実取得関数で成功、home 10件 |
| Prisma Client | 復旧モデル・リレーションのqueryが成功 |

実行チェック:

- `prisma validate`: PASS
- `prisma generate`: PASS（v5.7.0）
- `npx tsc --noEmit --pretty false --incremental false`: PASS
- `npx tsx scripts/test-recovery-business.ts`: PASS
- `scripts/verify-recovery-db.ts`: 接続先を使い捨てDBに固定してPASS
- `npm run build`: PASS、51静的ページ生成完了
- `git diff --check`: 最終変更PASS

transaction-mocked API検証は、新規Repair POST、再読込相当のpayloadからPATCHを2回、構造化ID・7列保持、外装PricingRule、構造化優先draft、legacy fallback、重複防止、Cal fallback、未登録部品を確認。
加えてpartRef記号保持、4gradeの分離、内装movement/外装watchブランドの検索軸を検証した。
build中には既存`/api/repairs/recent`のdynamic rendering診断とBrowserslist更新通知が出たが、終了コード0。
baseline SQL末尾の既存空行はreleaseとchecksum一致を保つため変更していない。

## 10. Checkpoint commits

| Commit | 内容 |
|---|---|
| `d9e5c9f` | Task135保全（safety branch） |
| `89e39b197d135b2db7005fd2f492847116a4a7e3` | 業務baseline確定 |
| `618eadbc3e0eb25f254056d335f8ef75e91a55db` | PublicCase production統合 |
| `de09ae1d09fa797513e94c05ae298d1030d4deb4` | Task135適用 |
| `4bbc86792a35c3f17cd5d48bfc41c6a37cab8d81` | schema・round-trip最終検証 |

本報告も独立したdocumentation commitで保存する。

## 11. 復元不能・制限・保全状態

- 調査対象で復元不能な業務コードは確認されなかった。
- **本番dumpのRepair、RepairLineItem、WorkCategory、WorkAction、WorkName、PricingRule、PartsMasterは0件**。今回失ったものではなく取得時の本番状態。業務データ/マスタ投入は今回の禁止範囲のため実行していない。
- 本番deployはしていない。本番画面はこのrecovery branchへまだ切り替わっていない。
- 元のローカルDB・FMP原本・生成データ・Adminは変更していない。
- Prisma DLLを使用していたこのrepoの開発サーバーを停止してClientを生成した。開発サーバーの再起動はしていない。
- 使い捨てコンテナと2つの検証DB、repo外backupを保持している。
- 既知のuntracked `docs/ai-tasks/126-production-prisma-migration-baseline-strategy.md` は原状保持。古い計画記録なので実行手順には使わない。
- FMPの既知未追跡データは復旧元の`.gitignore`で再びignoreされる。ファイルは削除していない。

## 12. 最後に手動確認する画面

復旧branchに対応するschema・業務マスタ・案件データを持つ検証環境で確認する。本番は未deploy。

1. `/repairs/new`: 最新レイアウト、顧客・時計・Movement Cal/Base Cal、内外装明細を入力して保存。
2. `/repairs/[id]`: 再読込・編集・再保存、内外装区分、処置、対象部品名、ステータス、既存明細保持。
3. Repair内の部品検索: profile保存、名前/番号/both、複数サイトpopup、Cousins、既存部品への番号追記・成長連携。
4. `/parts`、`/parts/new`、`/parts/[id]/edit`: 4grade、同じpartRefの重複判定、在庫・発注との連携。
5. `/masters/pricing`、`/orders`: B2B/B2C、内外装価格ルール、発注数量・状態。
6. Repairからのdraft作成 → `/public-cases/[id]`: 構造化snapshot、写真選択、公開/非公開、重複作成防止。
7. `/`、`/cases/gallery`、`/cases/gallery/[id]`: 導線、検索、原画像比率、価格非表示。
8. Repair撮影ダイアログ: 実機の入力・映像・保存解像度、4K入力時の保存画像、縦横比と画質。
