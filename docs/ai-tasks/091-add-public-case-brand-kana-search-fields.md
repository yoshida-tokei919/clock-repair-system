# AI Task 091: PublicCaseブランドカナ・検索フィールド追加

## 目的

ブランドカナ確定マッピングをPublicCaseへ反映する前段階として、既存Brand / BrandMaster相当モデルのカナ・alias系フィールドを調査し、PublicCaseにブランドカナ・表示名・検索用テキストを持たせるための最小schema変更を行う。

今回はschema差分の最小実装とPrisma Client生成までを対象とし、DB反映、migration作成、PublicCase再生成、FMP import再実行、公開ページ実装、検索実装は行わない。

## 前提

- Task 089で `brand-kana-approved.csv/json` を作成済み。
- Task 090で、PublicCaseに `brandNameKana`、`brandDisplayName`、`searchText` を持たせる方針を設計済み。
- `confirmedKana` 空欄はカナなしでOK。
- カナなしの場合、`未確認（BRAND）` のような表示名は作らない。
- コピー表記を含む事例はPublicCase候補から除外する方針だが、今回は実装しない。

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

FMP過去案件:

- `brand-kana-approved` を使ってPublicCase候補を再生成する。
- コピー含有Caseは除外する。
- FMP専用の表示名クリーニング、読み仮名suffix削除、`○○` 補正を使う。

新アプリ通常Repair:

- Brand / BrandMasterのカナ名・aliasと構造化データからPublicCaseを生成する。
- FMP専用クリーニングには依存しない。

PublicCase化後:

- FMP由来でもWEB_APP由来でも同じB2C/B2B公開ページ、同じカードUIで扱う。
- 閲覧者にはFMP由来か新アプリ由来かを見分けさせない。

## Brand / BrandMaster 側の調査

既存schemaでは、ブランドマスタ相当は `Brand` model。

確認した既存フィールド:

- `name`
- `nameEn`
- `nameJp`
- `kana`
- `initialChar`

関連コード確認:

- `src/actions/master-actions.ts`
- `src/lib/master-normalize.ts`
- `src/lib/masterData.ts`
- `src/app/(app)/masters/pricing/page.tsx`
- `src/components/repairs/RepairEntryForm.tsx` は検索対象に出るが、今回は触っていない。

調査結果:

- `Brand.kana` はschemaに存在する。
- `findOrCreateBrand` は `kana` をselectしているが、照合には `name` / `nameEn` / `nameJp` を使っており、`kana` はまだ積極利用されていない。
- `getBrands` は `Brand` をそのまま返し、並び順は `nameJp`。
- 価格マスタ画面やRepairEntryFormでは主に `name` / `nameJp` / `nameEn` が使われている。
- `src/lib/masterData.ts` はサンプル的な静的データで `nameEn` / `nameJp` を使っており、`kana` は持っていない。

## 既存kana/alias系フィールドの有無

既存あり:

- `Brand.kana`
- `Customer.kana` は顧客カナでありブランドとは別用途。

既存なし:

- `Brand.nameKana`
- `Brand.kanaName`
- `Brand.alias`
- `Brand.aliases`
- `Brand.searchAliases`
- `PublicCase.brandNameKana`
- `PublicCase.brandDisplayName`
- `PublicCase.searchText`

判断:

- Brand側は既に `kana` があるため、今回はBrand schemaを変更しない。
- aliasはまだ既存フィールドがないが、検索実装前に設計・レビューしてから追加する。
- PublicCase側は公開スナップショットとして必要なため、今回最小追加する。

## PublicCaseに追加したフィールド

`PublicCase` に以下を追加した。

```prisma
brandNameKana    String?
brandDisplayName String?
searchText       String?
```

また、ブランドカナによる絞り込み・一覧確認を想定し、以下の単純indexを追加した。

```prisma
@@index([brandNameKana])
```

DB反映はまだ行っていない。

## brandNameKana の役割

公開時点のブランドカナスナップショット。

例:

- `オメガ`
- `ロレックス`
- `セイコー`

FMP由来では `brand-kana-approved.approvedBrandNameKana` から設定する。空欄の場合は `null`。

新アプリ通常Repair由来では、将来的に `Brand.kana` または整理後の `Brand.kanaName` からPublicCaseへスナップショットする。

## brandDisplayName の役割

B2C/B2B公開カードで表示するブランド名のスナップショット。

カナあり:

- `オメガ（OMEGA）`
- `ロレックス（ROLEX）`

カナなし:

- `OHARA`

`未確認（BRAND）` のような表示名は作らない。

## searchText の役割

B2C/B2B公開検索用の統合テキスト。

入れる候補:

- `approvedBrandName`
- `approvedBrandNameKana`
- `sourceBrandName`
- ブランドalias
- 大文字小文字展開
- モデル名
- Ref
- Cal
- 公開作業名
- 交換部品名
- 公開タグ
- 症状タグ

入れないもの:

- 顧客情報
- 取引先情報
- 内部メモ
- 原価、仕入価格、利益
- warning詳細
- `sourceRepairId`
- 未公開コメント
- コピーを含む除外対象

## index方針

今回の実装:

- `brandNameKana` には単純indexを追加。
- `searchText` にはindexを追加しない。

判断:

- 現時点では検索実装前なので、まず `searchText String?` のみ追加するA案を採用。
- PostgreSQL全文検索、`pg_trgm`、GIN index、別テーブル化などは検索仕様が固まってから検討する。
- PublicCase件数は現時点で約2,924件であり、初期実装では `searchText` の単純部分一致でも検証可能。

## コピー除外との関係

コピーを含むCaseは、PublicCase表示・検索対象にしない方針。

既存PublicCaseには以下がある。

- `reviewStatus`
- `b2bPublishStatus`
- `b2cPublishStatus`
- `excludeReasons Json?`
- `warnings Json?`
- `PublicCaseWarning`

判断:

- 今回、コピー除外用の新しいschemaは追加しない。
- FMP再生成時に `contains_copy_keyword` を `excludeReasons` に入れる。
- B2B/B2C公開状態は `HIDDEN` のまま、または候補生成段階で `isPublishCandidate=false` とする。
- 必要に応じて `PublicCaseWarning` に `contains_copy_keyword` を `REVIEW` または `INFO` として残す。
- コピーを含む内容は `searchText` に入れない。

## 実行した確認コマンド

実行:

```powershell
npx prisma validate
npx prisma generate
npx tsc --noEmit --pretty false --incremental false
```

結果:

- `npx prisma validate`: 成功
- `npx prisma generate`: 初回はNext dev serverがPrisma Client DLLを掴んでいたため `EPERM unlink`。Next dev serverを停止後、成功。
- `npx tsc --noEmit --pretty false --incremental false`: 成功

実行していない:

- `npx prisma db push`
- `npx prisma migrate dev`
- `npx prisma migrate deploy`

## 変更しなかったもの

- DB反映はしていない。
- migrationは作成していない。
- seedは作成していない。
- Supabase本番DBには接続・反映していない。
- Brand / BrandMaster schemaは変更していない。
- 既存マスタデータは変更していない。
- CSV / Excel元データ本体は変更していない。
- generated JSON / CSV本体は変更していない。
- PublicCase再生成はしていない。
- FMP import再実行はしていない。
- 公開ページ実装、検索実装はしていない。
- `RepairEntryForm.tsx`、`PricingRule` は触っていない。

## 次タスク案

- Task 092: PublicCaseブランドカナschema差分レビュー
- Task 093: FMP PublicCase候補生成へのbrand-kana-approved適用
- Task 094: コピー表記を含むPublicCase候補除外実装
- Task 095: FMP PublicCase import --replace設計
