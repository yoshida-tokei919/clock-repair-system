# AI Task 029: 標準部品マスター初期データ投入方針

## 目的

Task028で追加した標準部品カテゴリ・標準部品名・グレードのDBマスターに、初期データをどう投入するか設計する。

今回は調査・設計docsのみで、Prisma schema変更、migration作成、seed script作成、TypeScript/React/API/UI変更、既存PartsMaster補正は行わない。

## 調査対象

- `docs/design/critical-master-design-principles.md`
- `docs/ai-tasks/027-design-parts-master-standard-part-name-schema.md`
- `docs/ai-tasks/027-5-audit-and-redesign-parts-master-masters.md`
- `prisma/schema.prisma`
- `src/lib/part-input-options.ts`
- `prisma/seed.ts`
- `package.json`

## part-input-options.ts確認結果

`src/lib/part-input-options.ts` には、部品入力候補として以下が定義されている。

- `PartInputType = "part_internal" | "part_external"`
- `PartCategoryOption`
- `PartNameOption`
- `PART_INPUT_TYPES`
- `PART_CATEGORIES`
- `PART_NAME_OPTIONS`
- `getPartCategoriesByType`
- `getPartNamesByCategory`
- `getPartNameOptionByKey`

確認結果:

- カテゴリ数: 16件
- 部品名候補数: 223件
- `PART_CATEGORIES.key` の重複: なし
- `PART_NAME_OPTIONS.key` の重複: なし
- `PartNameOption.categoryKey` が未定義カテゴリを参照しているもの: なし
- `sortOrder` 専用フィールド: なし
- 表示順: 配列順を暗黙のsortOrderとして使える

注意点:

- `PartCategoryOption` には `labelJa` はあるが `nameEn` はない。
- `PartNameOption` には `nameJa`, `nameEn`, `displayJa`, `displayEn` がある。
- `displayJa` / `displayEn` は針位置や上下位置などを含む表示向けの値として扱う。
- `handPosition`, `movementTarget`, `movementPosition` は標準部品名の補助属性であり、Task029の初期投入ではそのままDBカラム化しない。
- ファイル内の一部日本語表示は文字化けしているため、初期投入前に表示名をそのまま投入してよいか別途確認が必要。

## PartCategoryMaster投入方針

`PART_CATEGORIES` を `PartCategoryMaster` の初期データ元にする。

対応:

- `PART_CATEGORIES.key` -> `PartCategoryMaster.key`
- `PART_CATEGORIES.partType` -> `PartCategoryMaster.partType`
- `PART_CATEGORIES.labelJa` -> `PartCategoryMaster.nameJa`
- `nameEn` -> ひとまず `null`
- 配列index -> `sortOrder`
- `isActive` -> `true`

方針:

- `partType` は `part_internal` / `part_external` のまま保存する。
- `internal`, `external`, `interior`, `exterior` などの別表記は増やさない。
- `key` は安定識別子として扱う。
- 同じ `key` が存在する場合はupsertで表示名、`partType`, `sortOrder`, `isActive` を更新する。
- DBに存在するが `PART_CATEGORIES` から消えたkeyは物理削除しない。
- 削除候補は `isActive=false` にするか、まずは何もしない運用にする。

推奨:

- 初回実装では「コード定義に存在するkeyだけupsertし、消えたkeyは触らない」を推奨する。
- 無効化は、削除判定の誤爆を避けるため後続Taskで明示オプションにする。

## PartNameMaster投入方針

`PART_NAME_OPTIONS` を `PartNameMaster` の初期データ元にする。

対応:

- `PartNameOption.key` -> `PartNameMaster.key`
- `PartNameOption.categoryKey` -> `PartCategoryMaster.key` から `categoryId` を解決
- `PartNameOption.partType` -> `PartNameMaster.partType`
- `PartNameOption.nameJa` -> `PartNameMaster.nameJa`
- `PartNameOption.nameEn` -> `PartNameMaster.nameEn`
- `PartNameOption.displayJa` -> `PartNameMaster.displayJa`
- `PartNameOption.displayEn` -> `PartNameMaster.displayEn`
- 配列index -> `sortOrder`
- `isActive` -> `true`

方針:

- `PartNameMaster` は「ゼンマイ」「竜頭」「ガラス」などの標準部品名を管理する。
- 価格、仕入先、在庫、部品Ref、Cousins番号は持たない。
- 実際に使える・買える部品候補は `PartsMaster` が持つ。
- `categoryId` は `PartCategoryMaster.key` から解決する。
- categoryKeyが見つからない場合は投入を止め、エラーとして報告する。
- 同じ `key` が存在する場合はupsertで名称、表示名、カテゴリ、`partType`, `sortOrder`, `isActive` を更新する。

category変更時の扱い:

- `PartNameOption.categoryKey` が変わった場合、upsertで `categoryId` を更新してよい。
- ただし既存PartsMasterがそのPartNameMasterを参照している場合でも、標準分類の修正として扱う。
- 大きな分類変更はログに出し、実行前後で確認できるようにする。

display名変更時の扱い:

- 同じkeyの表示名変更はupdateで扱う。
- `nameJa` / `nameEn` は標準名、`displayJa` / `displayEn` はUI表示補助として分ける。

## PartGradeMaster投入方針

最低限、以下を初期データとして投入する。

| key | nameJa | nameEn | sortOrder |
|---|---|---|---:|
| `genuine` | 純正 | genuine | 10 |
| `fit` | FIT | fit / aftermarket | 20 |
| `custom_fit` | 合わせ | custom fit | 30 |

方針:

- `key` を安定識別子としてupsertする。
- `nameJa`, `nameEn`, `sortOrder`, `isActive` を更新対象にする。
- グレードは単なるラベルではなく、価格・品質・仕入先・在庫・顧客説明に関わる重要マスターとして扱う。
- 既存 `PartsMaster.grade` 文字列は削除しない。
- 後続Taskで `PartsMaster.grade` から `gradeId` を推測補正する。

既存grade文字列との対応候補:

- `純正`, `GENUINE`, `genuine`, `正規`, `純正品` -> `genuine`
- `FIT`, `fit`, `aftermarket`, `社外`, `社外品` -> `fit`
- `合わせ`, `custom fit`, `加工`, `調整品` -> `custom_fit`

注意:

- 自動補正では曖昧な値を無理に推測しない。
- 不明なgradeは `gradeId = null` のまま残し、補正リストで確認する。

## seed方式とscript方式の比較

### 案A: Prisma seedに組み込む

例:

- `prisma/seed.ts`
- `npx prisma db seed`

利点:

- Prisma標準の導線で実行できる。
- `package.json` には既に `prisma.seed` が定義されている。
- local環境の初期化手順に組み込みやすい。

弱点:

- 既存 `prisma/seed.ts` はAdmin、Supplier、Partner、Brandも扱っているため、標準部品マスターだけ再投入したい時に影響範囲が広い。
- 本番DBへ標準部品マスターだけ適用したい場合に運用が重くなる。
- 既存seed内にも文字化けデータがあるため、同時修正の誘惑が出やすい。

### 案B: 独立scriptとして作る

例:

- `scripts/seed-part-standard-masters.ts`
- `npx tsx scripts/seed-part-standard-masters.ts`

利点:

- 標準部品マスターだけ安全に再投入できる。
- 本番DB、検証DB、local DBで同じscriptを使いやすい。
- ログ、dry-run、無効化オプションを追加しやすい。
- 既存seedに触らずに進められる。
- Codex作業で差分を小さく管理しやすい。

弱点:

- 実行コマンドを別途docs化する必要がある。
- Prisma標準seedに自動では乗らない。
- 将来的には `prisma/seed.ts` から呼び出すかどうかを判断する必要がある。

### 案C: 初期は手動SQLまたは管理画面で登録

利点:

- 実装量が少ない。
- 少数データならすぐ登録できる。

弱点:

- 再実行性が弱い。
- local / staging / productionで差分が出やすい。
- key重複や表示順の一貫性を保ちづらい。
- マスター駆動の設計方針と相性が悪い。

## seed/script推奨方針

Task030では、案Bの独立scriptを推奨する。

推奨理由:

- 今回の対象は業務上重要な標準マスターであり、再実行性とログが重要。
- 既存 `prisma/seed.ts` に他の初期データが含まれているため、混ぜると本番適用時のリスクが上がる。
- `part-input-options.ts` からカテゴリ・部品名を読み、`PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` へupsertする処理を小さく閉じ込められる。
- 後から `prisma/seed.ts` へ組み込むこともできる。

推奨script案:

```text
scripts/seed-part-standard-masters.ts
```

実行例:

```text
npx tsx scripts/seed-part-standard-masters.ts
```

将来オプション案:

- `--dry-run`
- `--deactivate-missing`
- `--only=category|name|grade`

## upsert方針

共通方針:

- `key` を一意キーとしてupsertする。
- 既存keyがあれば表示名、英語名、`sortOrder`, `isActive` を更新する。
- `createdAt` / `updatedAt` はPrismaに任せる。
- 物理削除はしない。
- 手動追加されたDBマスターを不用意に消さない。

PartCategoryMaster:

- `key` でupsert。
- update対象: `partType`, `nameJa`, `nameEn`, `sortOrder`, `isActive`

PartNameMaster:

- `key` でupsert。
- update対象: `categoryId`, `partType`, `nameJa`, `nameEn`, `displayJa`, `displayEn`, `sortOrder`, `isActive`
- `categoryId` は事前に `PartCategoryMaster.key` から解決する。

PartGradeMaster:

- `key` でupsert。
- update対象: `nameJa`, `nameEn`, `sortOrder`, `isActive`

削除・無効化:

- 初回scriptでは、DBにあるがコード定義から消えたkeyは何もしない。
- 無効化したい場合は、後続で `--deactivate-missing` のような明示オプションを検討する。
- これにより、DB上で手動追加した候補を勝手に無効化しない。

ログ方針:

- upsert件数をカテゴリ・部品名・グレード別に出す。
- categoryKey未解決があればエラーで止める。
- duplicate keyはscript実行前チェックで検出し、DB更新前に止める。
- 既存DB側に同keyがありカテゴリ変更が発生する場合はログに出す。

## 既存PartsMaster補正との分離方針

Task029では、既存PartsMasterの補正は行わない。

後続Taskで分けること:

- 既存 `PartsMaster.nameJp` / `nameEn` から `standardPartNameId` を推測する。
- 既存 `PartsMaster.grade` から `gradeId` を推測する。
- 推測できたものだけ補完する。
- 推測できないものはnullのまま残す。
- 補正結果を確認できるログまたはCSV/Markdownリストを出す。
- 補正scriptはdry-runを先に実行できるようにする。

分離する理由:

- 初期マスター投入と既存データ補正はリスクが違う。
- 既存PartsMasterには表記ゆれや業務判断が必要なものがある。
- 自動推測を急ぐと誤分類が起きる。
- まず標準マスターを安定投入し、その後に既存データを段階補正する方が安全。

## 既存UI/APIとの関係

Task029ではUI/APIは変更しない。

後続Taskの方針:

- PartsFormは現在のUIを大きく作り直さない。
- 部品種別 / 部品カテゴリ / 部品名候補の流れを維持する。
- 部品名（日本語）/ 部品名（英語）の手入力欄も維持する。
- 新規登録からDB標準マスター参照を保存する方向へ寄せる。
- 既存 `partType`, `category`, `subcategory`, `grade`, `nameJp`, `nameEn` は互換用に残す。

## 次Task案

- Task030: 標準マスターseed script作成
- Task031: PartsFormでDBマスター候補を読む
- Task032: 既存PartsMasterの `standardPartNameId` / `gradeId` 補正方針とdry-run script作成
- Task033: PartsSearchPanelで標準マスターを使う
- Task034: Web検索語生成で `PartNameMaster.nameEn` を使う

## コード/schema変更していないこと

今回変更したのはこの設計docsのみ。

- `prisma/schema.prisma` は変更していない。
- migrationは作成していない。
- seed scriptは作成していない。
- TypeScriptコードは変更していない。
- React/UIコードは変更していない。
- APIコードは変更していない。
- 既存PartsMasterデータは補正していない。
- stashは戻していない。
- Task025 / Task026 には触っていない。
