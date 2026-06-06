# AI Task 090: ブランドカナのPublicCase反映設計

## 目的

Task 089で作成した確定版ブランドカナマッピング `brand-kana-approved` を、今後どのデータ構造へ反映するかを設計する。

今回は設計のみを行い、DB schema変更、migration作成、BrandMaster更新、PublicCase再生成、FMP import再実行、公開ページ実装は行わない。

## 前提

- `brand-kana-approved.csv/json` はヨシダ確認済みのブランドカナ確定マッピング。
- 総ブランド数は305件。
- `hasKana=true` は248件、`hasKana=false` は57件。
- `confirmedKana` 空欄はカナなしでOKとして扱う。
- カナなし行に `未確認（BRAND）` のような表示名は作らない。
- 既存 `Brand` model には `name`, `nameEn`, `nameJp`, `kana` がある。
- 現在の `PublicCase` model は `brandName` を持つが、`brandNameKana`、`brandDisplayName`、`searchText` はまだ持たない。

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

FMP過去案件:

- FMP専用ルールでPublicCase候補を生成する。
- `brand-kana-approved` を使って `brandName`、`brandNameKana`、`brandDisplayName`、`searchText` を付与する。
- FMP専用の読み仮名suffix削除、`○○` 補正、未紐づけPartItem救済、コピー表記除外などはFMP変換側に閉じ込める。

新アプリ通常Repair案件:

- 構造化データとブランドマスタからPublicCaseを生成する。
- FMP専用クリーニングや読み仮名削除には依存しない。
- ブランドカナは `Brand` / `BrandMaster` の `kana` または将来の `kanaName` からPublicCaseへスナップショットする。

PublicCase化後:

- FMP由来かWEB_APP由来かを閲覧者には見せない。
- 同じB2C/B2B公開ページ、同じカードUI、同じ検索設計で扱う。

## コピー表記を含む事例の除外方針

公開事例では、以下の公開表示・検索対象に `コピー` を含む事例は掲載しない。

- ブランド名
- モデル名
- Ref
- Cal
- 修理内容
- 交換部品名
- 公開表示名
- 検索用テキスト

例:

- `ROLEX(コピー）`
- `コピー品`
- `コピー時計`

FMP PublicCase再生成時の方針:

- copy keyword を検出する。
- `contains_copy_keyword` などの除外理由を付ける。
- `b2bCandidate=false`、`b2cCandidate=false` または公開対象外状態にする。
- B2C/B2Bどちらにも掲載しない。
- `searchText` にも入れない。
- ブランド正規化して掲載するのではなく、PublicCase候補から除外する。

新アプリ通常Repairの方針:

- 構造化入力時点でコピー品・掲載不可を明示できる項目を検討する。
- PublicCase化時にコピー品・掲載不可フラグを見て除外する。
- 公開ページ側で隠すのではなく、PublicCase化前またはPublicCaseレビュー時点で止める。

## brand-kana-approved の使い方

`brand-kana-approved` の列:

- `sourceBrandName`
- `approvedBrandName`
- `approvedBrandNameKana`
- `approvedDisplayName`
- `hasKana`
- `sourceCount`
- `reviewStatus`
- `note`

FMP PublicCase再生成時の使い方:

- `sourceBrandName`: FMP由来の元ブランド名との照合キー。
- `approvedBrandName`: PublicCaseの正規化済み `brandName` として使う候補。
- `approvedBrandNameKana`: PublicCaseの `brandNameKana` として使う。空欄OK。
- `approvedDisplayName`: PublicCaseの `brandDisplayName` として使う。
- `note`: `掲載対象外: コピー表記` など、除外判定やレビュー補助に使う。

照合はまず完全一致を基本にする。将来的に大文字小文字・スペース違いを吸収する場合も、`sourceBrandName` と元データの対応を失わないようにする。

## Brand / BrandMaster 側の設計

既存 `Brand` model:

- `name`: unique。Legacy support または内部ID/英字名。
- `nameEn`: 英字名。
- `nameJp`: 日本語名。
- `kana`: カナ名と思われる既存フィールド。

最小方針:

- 既存 `Brand.kana` をブランドカナの正規項目として使えるか確認する。
- 既存データで `kana` の意味が揺れている場合は、将来的に `kanaName` または `nameKana` へ整理する。
- 既存 `nameJp` と `kana` の役割を分ける。
  - `nameJp`: 日本語ブランド名・和名がある場合の表示名。
  - `kana` / `kanaName`: 検索・読み用のカナ名。

追加候補フィールド:

- `kanaName String?`: 意味が明確なブランドカナ名。
- `displayName String?`: 管理画面・公開表示の標準名。ただしPublicCaseではスナップショットを持つ。
- `aliases Json?`: 表記ゆれ検索用alias。
- `searchAliases Json?`: 検索専用alias。`aliases` と統合してもよい。

推奨:

- 既存 `kana` をすぐ増やすのではなく、Task 091で既存データの意味を確認する。
- 新規追加するなら `kanaName` が読みやすい。
- aliasは文字列配列を保持したいので、Prismaでは `Json?` が最小実装として扱いやすい。

## PublicCase 側の設計

PublicCaseは公開時点のスナップショットなので、BrandMasterの変更に引きずられない表示情報を持つ。

追加候補:

- `brandNameKana String?`
- `brandDisplayName String?`
- `searchText String?`
- `searchKeywords Json?`

推奨する最小追加:

- `brandNameKana String?`
- `brandDisplayName String?`
- `searchText String?`

理由:

- `brandNameKana`: 表示・検索で直接使う。
- `brandDisplayName`: 公開カードで `オメガ（OMEGA）` のようにそのまま使える。
- `searchText`: B2C/B2B共通のフリーワード検索で使える。

例:

```text
brandName: OMEGA
brandNameKana: オメガ
brandDisplayName: オメガ（OMEGA）
searchText: OMEGA omega オメガ シーマスター Seamaster 196.1114 1538 オーバーホール
```

カナなしの場合:

```text
brandName: OHARA
brandNameKana: null
brandDisplayName: OHARA
searchText: OHARA ...
```

`未確認（OHARA）` のような表示名は作らない。

## brandDisplayName 生成ルール

FMP:

1. FMP元ブランド名で `brand-kana-approved.sourceBrandName` を引く。
2. 見つかった場合:
   - `brandName = approvedBrandName`
   - `brandNameKana = approvedBrandNameKana` または `null`
   - `brandDisplayName = approvedDisplayName`
3. 見つからない場合:
   - `brandName = FMP元ブランド名`
   - `brandNameKana = null`
   - `brandDisplayName = FMP元ブランド名`
   - warningまたはreview対象にする。

共通ルール:

- カナがある場合: `カナ（英字ブランド名）`
- カナがない場合: `英字ブランド名`
- `未確認（BRAND）` は作らない。
- `コピー` を含む場合は表示名生成ではなく除外判定へ回す。

## searchText 設計

PublicCaseに `searchText` を持たせる案を推奨する。

理由:

- B2C/B2B公開検索で、ブランド、カナ、モデル、Ref、Cal、作業名、交換部品名をまとめて検索しやすい。
- PublicCaseは公開スナップショットなので、検索対象も公開時点で固定できる。
- DB側で全文検索や部分一致検索に進む前の最小実装として扱いやすい。

検索対象に入れるもの:

- `approvedBrandName`
- `approvedBrandNameKana`
- `sourceBrandName`
- ブランドalias
- 大文字小文字展開
- モデル名
- Ref
- Cal
- B2C/B2B公開表示名
- 修理内容
- 交換部品名
- 公開タグ
- 症状タグ

検索対象に入れないもの:

- 顧客情報
- 電話番号、住所、メール
- 取引先情報
- 内部メモ
- 原価、仕入価格、利益
- warning詳細
- `sourceRepairId`
- 未公開コメント
- コピーを含む除外対象

コピー表記を含む除外対象は、`searchText` を作らず公開候補から外す。

## alias 設計

表記ゆれ検索は、BrandMaster側で管理し、PublicCase生成時に `searchText` へスナップショットする方針がよい。

Brand側の候補:

- `aliases Json?`
- `searchAliases Json?`

PublicCase側の候補:

- `searchText String?`
- 必要なら `searchKeywords Json?`

例: TAG HEUER

表示:

- `タグ・ホイヤー（TAG HEUER）`

検索alias:

- `TAG HEUER`
- `Tag Heuer`
- `tag heuer`
- `タグ・ホイヤー`
- `タグホイヤー`
- `タグ ホイヤー`
- `タグ　ホイヤー`

例: Chopard

表示:

- `ショパール（Chopard）`

検索alias:

- `Chopard`
- `CHOPARD`
- `chopard`
- `ショパール`

Task 090ではalias実装は行わない。次タスクでBrandMaster側に持つか、PublicCase生成時に固定展開するかを決める。

## B2C/B2B表示方針

B2C/B2Bともにブランド表示ルールは共通にする。

カナあり:

```text
オメガ（OMEGA）
シーマスター
```

カナなし:

```text
OHARA
```

表示ページはFMP用と新アプリ用に分けない。

- FMP由来でもWEB_APP由来でも、PublicCase化後は同じカードUIで表示する。
- B2Cでは価格を表示しない。
- B2Bでは価格表示可能な技術料・交換部品・合計のみ表示する。
- 閲覧者に `sourceType` は見せない。

## FMP再生成・再投入方針

ローカルDBには既にPublicCaseが投入済みだが、`brandNameKana`、`brandDisplayName`、`searchText` を追加する場合は再反映が必要になる。

### A案: ローカルDBの既存PublicCaseをupdateする

メリット:

- 早い。
- 既存投入データへ最小操作で反映できる。

デメリット:

- 生成物とDBの内容がズレる。
- 再現性が落ちる。
- 将来Supabase投入時に同じ状態を再現しづらい。
- FMP専用変換ルールがimport後updateに分散する。

### B案: public-case-candidates を再生成し、import --replace で再投入する

メリット:

- 再現性が高い。
- FMP専用ルールを生成側に集約できる。
- dry-run、sample、preview、import payloadが同じ前提になる。
- 今後Supabase投入時も同じ手順で使える。

デメリット:

- `generate-fmp-public-case-candidates.ts` の修正が必要。
- `import-fmp-public-cases.ts` に `--replace` 実装が必要。
- 再投入前後の件数検証が必要。

推奨:

- B案を優先する。
- まず生成スクリプトで `brand-kana-approved` を読み、PublicCase候補JSONに `brandNameKana`、`brandDisplayName`、`searchText`、コピー除外理由を追加する。
- 次にdry-run payloadへ反映する。
- 最後にローカルDBで `import --replace` を検証する。

## 新アプリ通常Repairとの関係

新アプリ通常Repairでは、`brand-kana-approved` を直接使わない。

FMP:

- `brand-kana-approved` -> PublicCase

新アプリ:

- `BrandMaster` / `Brand` -> PublicCase

新アプリ通常Repairでは、登録時点でブランド、モデル、Ref、Cal、作業、部品、価格が構造化されている前提にする。PublicCase化時にはBrandMasterの `kanaName` / `aliases` を参照し、公開時点スナップショットとしてPublicCaseへ保存する。

## 推奨実装順

1. Task 091: Brand / BrandMaster の `kanaName` / alias 設計と既存 `kana` の意味確認
2. Task 092: PublicCase `brandNameKana` / `brandDisplayName` / `searchText` schema設計
3. Task 093: FMP PublicCase候補生成へ `brand-kana-approved` 適用設計
4. Task 094: コピー表記を含むPublicCase候補除外設計
5. Task 095: `import --replace` 設計
6. Task 096: ローカルDBでFMP PublicCase再生成・replace再投入検証
7. Task 097: B2C/B2B公開検索UI設計

## 変更しなかったもの

- DB schemaは変更していない。
- migrationは作成していない。
- seedは作成していない。
- Supabase本番DBには接続していない。
- DB更新はしていない。
- FMP元CSV / Excel本体は変更していない。
- `brand-kana-approved.csv/json` は変更していない。
- PublicCase再生成はしていない。
- FMP import再実行はしていない。
- 既存公開ページは変更していない。
- `RepairEntryForm.tsx`、`PricingRule`、既存マスタは変更していない。

## 次タスク案

- Task 091: Brand / BrandMaster kanaName・alias schema設計
- Task 092: PublicCase brandNameKana・brandDisplayName・searchText schema設計
- Task 093: FMP PublicCase生成へのbrand-kana-approved適用設計
