# Task190A: Scheduler設定・標準作業時間 schema foundation

## 範囲と状態

Task185〜187の設計を受け、`SchedulerSetting`、`SchedulerActivitySetting`、`RepairWorkTimeStandard` のPrisma schemaとmigrationを追加する。Task190B以降のresolver、実績採用、設定UI/API、自動スケジューラ接続は含まない。Production: pending。migrationは未適用、deployも未実施。

## 設定の正本

- `SchedulerSetting` は `id=1` のglobal設定。migrationで1行を作る。PKと `CHECK (id=1)` が2行目を拒否する。削除を禁止する仕組みは設けず、後続の読み取り実装では欠損時の明示的エラーまたはfallbackを決める。Task190Aには読み取り処理がない。
- 既定値は標準1日480分、予定確認30分、修理のAUTO学習、最低3件、十分な件数10件、初期集計MEDIAN、十分な件数以降の既定集計MEAN、集計期間6ヶ月、外れ値処理NONE。DBのCHECKで時間、件数、期間の範囲と最低件数≤十分な件数を保証する。
- Task185の「1〜9件は中央値」に対し、最低3件の初期値では1〜2件を自動採用しない解釈になる。これは今回指定された初期値に従う設定保存形であり、実際の採用条件と表示はTask190Bで確定する。
- `SchedulerActivitySetting` は `WorkTimeActivityType` をPKとして8区分を初期投入する。`REPAIR` はDBのCHECKで除外し、上記global修理ルールと修理標準時間で扱う。ESTIMATEは手動20分、集計の主期間3ヶ月・代替期間6ヶ月・最低100件、INQUIRYは60分/日の予約枠。その他は手動標準時間なし、予約0分、期間6ヶ月、最低3件。すべて初期学習modeはMANUAL。NULLの手動標準時間を0分と解釈しない。
- 業務区分の行を削除した場合の復旧やreset UIは後続Taskに委ねる。migrationで1回初期投入し、実行時やseedで上書きしない。WorkCalendarの `DEFAULT_WORK_MINUTES=480` はこのTaskで変更しないため、新設定を既存のスケジューラ容量へ即時反映しない。

## 修理標準時間

- `RepairWorkTimeStandard` は一般条件標準で、`repairType`、`RepairWorkCategory`、任意の `PartNameMaster`、任意の `RepairWorkAction`、任意の `detailLabel`、任意の `WatchDriveType`、正の整数 `standardMinutes` を持つ。外装の `driveType` はNULLに限る。categoryの内装・外装一致は複合FKで保証する。
- `targetPartNameId` は文字列IDで `PartNameMaster` を参照する。`PartsMaster` は参照しない。`RepairWorkName` は入力候補のマスタで、現行 `RepairLineItem` にそのIDが保存されないため、標準時間のキーには使わない。replaceで再採番される `RepairLineItem.id` も参照しない。
- PostgreSQLの通常のnullable複合UNIQUEではNULLを含む重複を防げない。migrationではPostgreSQL 15以降の `UNIQUE NULLS NOT DISTINCT` を使い、NULLを含む同一条件を拒否する。NULLの代替値による有効なマスタIDとの衝突を避ける。`detailLabel` はNULLか前後空白のない非空文字列とする。0分の同時施工補正はこの単体標準時間表へ混ぜず、後続Taskで別設計する。
- `RepairWorkCategory` は `repairType` を持ち、`(categoryId, repairType)` の複合FKで内装・外装の一致をDBが保証する。`RepairWorkAction` は内装・外装で共有され `repairType` 列がなく、`PartNameMaster` にも `repairType` 列がないため、それぞれの単独FKはIDの存在のみを保証する。処置・対象部品名がその内装/外装カテゴリに適用可能かは、後続Taskの設定UI/APIで正本の選択条件に沿って検証する。Task190Aには設定UI/APIも標準時間の初期行もない。
- Cal/Base Cal/Brand/Model/Refは一般標準のキーに入れない。実績の優先検索は後続Taskで扱う。`additionalFunctions` は現行schemaに汎用的な保持先がなく、今回の標準時間条件にも追加しない。`WatchDriveType` は現行の駆動方式enumを利用するが、追加機能や手巻き/自動巻きを代用しない。
- 標準時間の初期行は投入しない。存在しない条件に推測値をseedしない。

## セキュリティと確認

3テーブルはserver-only。migration内でRLSを有効化し、3テーブルと `RepairWorkTimeStandard_id_seq` の権限をanon、authenticated、service_roleからのみ `REVOKE ALL` する。Data API向けGRANTやpolicyは置かない。Prismaが使用するDB owner権限でのサーバー操作を想定する。

ローカル確認結果:

- `npx prisma validate`: PASS。
- `npx tsc --noEmit --incremental false`: PASS。新モデルを使うruntimeコードはまだない。
- `tests/task190a-schema.test.mjs`: 直接実行で確認。`node --test` は環境の `spawn EPERM` で起動できなかった。
- `npx prisma generate`: Windowsの既存query engine DLL置換が `EPERM`。`PRISMA_GENERATE_NO_ENGINE=1` もネットワーク制限でschema engineを取得できず、生成は未確認。
- PostgreSQL 17の一時Dockerコンテナへ初版migrationを適用: PASS。初期行数・値、重複条件、一致しない内外装category、外装driveType、正の標準分、singleton、件数閾値、REPAIR行禁止、RLS、anon / authenticated / service_role のtable / sequence権限を確認。コンテナは削除済み。この検証は既存schema全体を再現せず、参照先マスタを最小定義したisolated fixtureである。
- `git diff --check`: PASS。
- 独立レビュー: migrationがWorkTimeSessionより先に並ぶ問題と、NULL代替値 `''` / `-1` が有効マスタIDと衝突し得る問題を指摘。migration名を既存WorkTimeSessionより後へ変更し、一意索引を `NULLS NOT DISTINCT` に修正。`RepairWorkAction` / `PartNameMaster` の内外装適用可否は現行schemaだけではDB保証できないため、後続UI/API validation境界として明記した。
- 修正後のmigrationをPostgreSQL 15 isolated fixtureへ適用してPASS。NULL条件の重複拒否と、マスタID `''` / `-1` を使う別条件の許容を確認。初期行、singleton、閾値、REPAIR除外、内外装category、外装driveType、正の標準分、RLS、3 roleのtable/sequence権限も再確認。コンテナは削除済み。保護対象 `docs/ai/02_PRODUCT_ROADMAP.md` は `+271 / -57` のまま維持。

production DB適用・Supabase migration・deploy・pushは未実施。別プロセスにより基礎実装のlocal commit `20cc592` が作成され、今回の一意索引修正は未commit。Production: pending。production権限の実測は未確認。
