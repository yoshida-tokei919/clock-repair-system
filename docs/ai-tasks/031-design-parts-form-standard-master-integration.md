# AI Task 031: PartsForm標準マスター接続設計

## 目的

Task028からTask030で追加・投入した標準部品カテゴリ、標準部品名、グレードのDBマスターを、既存のPartsFormへどう接続するかを設計する。

今回は調査・設計のみで、コード変更、Prisma schema変更、migration作成、API変更、UI変更、DB変更は行わない。

## 前提

以下の標準マスターはDBに追加済み。

- `PartCategoryMaster`
- `PartNameMaster`
- `PartGradeMaster`

Supabaseには初期データ投入済み。

- `PartCategoryMaster`: 16件
- `PartNameMaster`: 223件
- `PartGradeMaster`: 3件

重要方針:

- 自由入力を極力避け、候補選択・ドリルダウン入力を基本にする。
- `PartNameMaster` は「ゼンマイ」「竜頭」「ガラス」などの標準部品名を表す。
- `PartsMaster` は実際に使える・買える部品候補を表す。
- `PartGradeMaster` は純正、FIT、合わせなど、価格・品質・仕入先・在庫に関わる重要分類を表す。
- 既存UIを一気に作り直さない。
- 既存 `PartsMaster.grade` / `partType` / `category` / `subcategory` はすぐ削除しない。

## 調査対象

確認したファイル:

- `docs/design/critical-master-design-principles.md`
- `docs/ai-tasks/027-design-parts-master-standard-part-name-schema.md`
- `docs/ai-tasks/027-5-audit-and-redesign-parts-master-masters.md`
- `docs/ai-tasks/029-design-part-standard-master-seeding.md`
- `docs/ai-tasks/030-13-design-empty-supabase-initialization.md`
- `docs/ai-tasks/030-14-empty-supabase-initialization-runbook.md`
- `prisma/schema.prisma`
- `src/lib/part-input-options.ts`
- `src/components/parts/PartsForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/lib/parts-master.ts`
- `src/app/api/parts/search/route.ts`
- `src/app/api/parts/route.ts`
- `src/app/api/parts/[id]/route.ts`
- `src/app/api/master-data/route.ts`

存在しない調査対象ファイルはなかった。

## 現在のPartsForm構造

`PartsForm.tsx` は、現在 `/api/master-data` から以下だけを取得している。

- `brands`
- `models`
- `calibers`
- `suppliers`

まだ `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` は読み込んでいない。

現在の `FormData` は主に以下を持つ。

- 分類: `partType`, `category`, `subcategory`
- 外装条件: `brandId`, `modelId`, `watchRefs`
- 内装条件: `caliberId`, `baseCaliberId`, `movementMakerId`, `baseMakerId`
- 表示名: `nameJp`, `nameEn`, `name`
- 部品情報: `partRefs`, `cousinsNumber`, `grade`, `size`, `photoKey`
- 備考: `notes1`, `notes2`
- 価格: `costCurrency`, `costOriginal`, `latestCostYen`, `markupRate`, `retailPrice`
- 在庫: `stockQuantity`, `minStockAlert`, `minStockAlertEnabled`, `location`, `supplierId`

初期値では、`partType` は `interior`、`category` は `internal`、`grade` は `純正` になっている。

保存時は `handleSubmit` でpayloadを組み、作成時は `POST /api/parts`、編集時は `PUT /api/parts/[id]` を呼ぶ。payloadでは `name: form.nameJp` を既存互換のlegacyフィールドとして送っている。

編集時は `GET /api/parts/[id]` でPartsMasterを読み込み、既存カラムをFormDataへ戻している。

現在のUIの分類関連は以下。

- 先頭で `partType` のradioを表示する。
- 値は `interior` / `exterior`。
- 内装の場合、「ムーブメント情報」内に `subcategory` select がある。
- `subcategory` select の候補は内装サブカテゴリで、標準部品カテゴリや標準部品名とは別管理。
- 部品情報エリアには `nameJp`, `nameEn`, `partRefs`, `cousinsNumber`, `grade`, `size`, `photoKey`, `notes1`, `notes2` がある。
- `grade` は現在、固定候補のselectで `純正` / `FIT` / `合わせ` を選ぶ。

重要な現状差分として、現在の実ファイルにはTask026で想定していた「部品カテゴリ」「部品名候補」のDBマスター接続UIはまだ入っていない。旧来の `partType` radio と、内装向けの `subcategory` select が残っている状態。

## schema上の対応状況

`PartsMaster` にはすでに以下のnullable relationがある。

- `standardPartNameId String?`
- `standardPartName PartNameMaster?`
- `gradeId String?`
- `gradeMaster PartGradeMaster?`

既存互換カラムも残っている。

- `partType String?`
- `category String`
- `subcategory String?`
- `nameJp String`
- `nameEn String`
- `grade String?`

注意点として、既存 `partType` は `interior` / `exterior` を想定している一方、標準マスター側の `partType` は `part_internal` / `part_external` を想定している。PartsForm接続時にはこの変換を明示する必要がある。

推奨マッピング:

```text
PartsMaster.partType = interior  -> master partType = part_internal
PartsMaster.partType = exterior  -> master partType = part_external
```

既存 `category` は `internal` / `external` / `generic` の広い分類として残す。`PartCategoryMaster.key` をそのまま既存 `category` に入れると意味が衝突するため、最小実装では避ける。

## 新マスターとの対応方針

### PartCategoryMaster

用途:

- 部品カテゴリ候補の表示元。
- `partType` で候補を絞る。
- `PartNameMaster` の上位カテゴリとして使う。

PartsForm上の扱い:

- UIでは `partType` 選択後に `PartCategoryMaster` を選ばせる。
- `PartCategoryMaster.partType` は `part_internal` / `part_external` のまま扱う。
- `PartCategoryMaster.id` は、標準部品名候補を絞るためのUI状態として使う。
- Task028では `PartsMaster.partCategoryId` を追加していないため、最小実装ではPartsMasterへカテゴリrelationを保存しない。
- 選択されたカテゴリは `PartNameMaster.categoryId` を絞り込むための導線にする。

既存カラムとの役割分担:

- 既存 `PartsMaster.category` は互換用の広い分類として維持する。
- `interior` 選択時は既存 `category = internal`、`exterior` 選択時は既存 `category = external` を引き続き保存する。
- `PartCategoryMaster.key` を既存 `category` に保存しない。
- 既存 `subcategory` は将来的にdeprecated候補だが、schemaとpayloadからはまだ削除しない。

### PartNameMaster

用途:

- 標準部品名候補の表示元。
- 選択時に `PartsMaster.standardPartNameId` へ保存する。
- 選択時に `nameJp` / `nameEn` の初期値へ反映する。

表示名:

- 日本語表示は `displayJa ?? nameJa` を優先する。
- 英語表示は `displayEn ?? nameEn` を優先する。
- `nameEn` がない候補では英語欄を空または既存値維持にする。

PartsForm上の扱い:

- `PartCategoryMaster` 選択後、同じ `categoryId` の `PartNameMaster` だけを候補に出す。
- 選択された `PartNameMaster.id` を `standardPartNameId` として保存する。
- `nameJp` / `nameEn` は表示・帳票・顧客向け名称として手入力欄を残す。
- 標準名と表示名がズレても、分類軸は `standardPartNameId`、表示名は `nameJp` / `nameEn` として分ける。

標準名スナップショット:

- `PartsMaster` に `standardNameJa` / `standardNameEn` は追加しない。
- 標準名は常に `PartNameMaster` から取得する。
- key/nameズレを避けるため、PartsMaster側に標準名文字列を重複保持しない。

### PartGradeMaster

用途:

- グレード候補の表示元。
- 選択時に `PartsMaster.gradeId` へ保存する。
- 既存 `PartsMaster.grade` 文字列へも互換用の表示名を保存する。

PartsForm上の扱い:

- 既存の固定 `grade` select を `PartGradeMaster` 由来の候補に差し替える。
- 表示順は `sortOrder` を使う。
- 初期候補は `純正` / `FIT` / `合わせ`。
- 新規作成では `genuine` を初期選択にするのが既存挙動に近い。
- 既存行や移行途中では `gradeId` がnullでも許容する。

既存 `grade` との互換:

- `gradeId` を正の分類軸にする。
- 既存 `grade` は表示互換、帳票互換、既存画面互換として残す。
- 保存時は `gradeId` と同時に `grade = selectedGrade.nameJa` を送る。
- ユーザーが手入力でグレードを自由に増やす運用には戻さない。

## API設計方針

現在のPartsMaster保存は `src/lib/parts-master.ts` の `createOrUpdatePartsMaster` に集約されている。`POST /api/parts` と `PUT /api/parts/[id]` はどちらもこのhelperを呼ぶ。

最小変更案:

- `PartsMasterInput` に `standardPartNameId?: string | null` を追加する。
- `PartsMasterInput` に `gradeId?: string | null` を追加する。
- `buildNormalizedPartsMasterData` で `standardPartNameId` と `gradeId` をPartsMaster保存dataへ含める。
- IDが空文字ならnullへ正規化する。
- 存在しないIDが送られた場合は400相当で保存を止める。
- `gradeId` がある場合は `PartGradeMaster` を引き、互換用 `grade` に `nameJa` を入れる。
- `standardPartNameId` がある場合は `PartNameMaster` を引き、必要なら `nameJp` / `nameEn` の初期補完に使う。ただしユーザーが入力した `nameJp` / `nameEn` をAPI側で勝手に上書きしない。

取得API:

- `GET /api/parts` は `include` に `standardPartName` と `gradeMaster` を追加する。
- `GET /api/parts/[id]` も同様に `standardPartName` と `gradeMaster` を追加する。
- 既存クライアントは追加フィールドを無視できるため、破壊的変更にはなりにくい。

検索API:

- `src/app/api/parts/search/route.ts` は現在、`partType`, keyword, cal, ref を使って検索している。
- Task031の実装範囲では変更しない。
- 後続Taskで `standardPartNameId`, `gradeId`, `standardPartName.key`, `gradeMaster.key` を検索条件や返却情報に追加する。

バリデーション方針:

- `standardPartNameId` は存在確認する。
- `gradeId` は存在確認する。
- 可能なら `isActive=true` の候補だけ新規保存に使う。
- 編集時に既存の非active候補が紐づいている場合は表示は許容し、変更候補からは外すなどの扱いを後続で検討する。

## マスター取得方法の比較

### 案A: 既存 `/api/master-data` に追加する

既存レスポンスに以下を追加する。

- `partCategories`
- `partNames`
- `partGrades`

利点:

- PartsFormはすでに `/api/master-data` を1回読む構造なので最小差分。
- 既存のbrand/model/caliber/supplier取得と同じタイミングで候補を揃えられる。
- 初期件数はカテゴリ16、部品名223、グレード3で、PartsForm初期ロードに含めても過大ではない。
- 後続でPartsSearchPanelにも同じレスポンスを使いやすい。

注意点:

- `/api/master-data` の責務が少し広がる。
- 将来、候補数が大きく増えた場合は専用API分離を再検討する。

### 案B: 新規APIを作る

例:

- `/api/parts/standard-masters`
- `/api/part-standard-masters`

利点:

- 標準部品マスターの責務が分かりやすい。
- PartsSearchPanelやWeb検索からも呼びやすい。
- レスポンスを標準マスター専用に最適化できる。

注意点:

- PartsForm側のfetchが増える。
- 既存master-data取得と状態管理が分かれる。
- 最小差分としては案Aより大きい。

### 案C: Server Component / Server Action 経由

利点:

- 型を寄せやすい。
- API routeを増やさずに済む場合がある。

注意点:

- 現在のPartsFormはクライアントコンポーネントとしてfetchする構造。
- 既存設計からの変更が大きくなりやすい。
- 今回の最小接続には過剰。

### 推奨

Task032では案Aを推奨する。

`/api/master-data` に `partCategories`, `partNames`, `partGrades` を追加し、`isActive=true` の候補を `partType`, `sortOrder`, `nameJa` 順で返す。

`partNames` には最低限以下を含める。

- `id`
- `key`
- `categoryId`
- `partType`
- `nameJa`
- `nameEn`
- `displayJa`
- `displayEn`
- `sortOrder`
- `isActive`

`category` の `key` が必要な場合は `category: { id, key, partType }` も含める。ただしPartsForm内では `categoryId` で絞れるため、最小では必須ではない。

## UI最小変更方針

理想の流れ:

```text
部品種別
↓
部品カテゴリ
↓
標準部品名
↓
グレード
↓
部品名（日本語）
↓
部品名（英語）
```

最小変更では、現在の部品情報エリアに以下を足す、または既存項目を差し替える。

1. 既存 `partType` radio は維持する。
2. `partType` から標準マスター用 `part_internal` / `part_external` に変換する。
3. `PartCategoryMaster` select を追加する。
4. 選択カテゴリで `PartNameMaster` select を絞り込む。
5. `PartNameMaster` 選択時に `standardPartNameId` を保持する。
6. `PartNameMaster` 選択時に `nameJp` / `nameEn` を初期入力する。
7. `nameJp` / `nameEn` の手入力欄は残す。
8. 既存 `grade` select を `PartGradeMaster` 由来のselectへ差し替える。
9. `gradeId` と互換用 `grade` を両方保持する。

FormDataの追加候補:

```ts
partCategoryMasterId?: string
standardPartNameId?: string
gradeId?: string
```

`partCategoryMasterId` は最小実装ではUI絞り込み用で、PartsMasterへ保存しない。`standardPartNameId` と `gradeId` はPartsMasterへ保存する。

イベント方針:

- `partType` 変更時:
  - `partCategoryMasterId` を空にする。
  - `standardPartNameId` を空にする。
  - 既存 `category` を `internal` / `external` に更新する。
- `partCategoryMasterId` 変更時:
  - `standardPartNameId` を空にする。
  - `nameJp` / `nameEn` はユーザー入力済みなら勝手に消さない。
- `standardPartNameId` 変更時:
  - `nameJp` が空なら `displayJa ?? nameJa` を入れる。
  - `nameEn` が空なら `displayEn ?? nameEn` を入れる。
  - 既に入力済みの場合、最小実装では上書きしない方が安全。
- `gradeId` 変更時:
  - 互換用 `grade` に `PartGradeMaster.nameJa` を入れる。

## 不要サブカテゴリselectの扱い

現在のPartsFormには、内装時の「ムーブメント情報」内に `subcategory` select が存在する。

これは以下の理由で、標準マスター接続後は表示から外すべき。

- 標準部品カテゴリと役割が重複する。
- 「ムーブメント情報」内にあるため、部品カテゴリ選択として見つけづらい。
- 内装だけの旧サブカテゴリであり、外装部品カテゴリと統一できない。
- 今後の分類軸は `PartCategoryMaster` + `PartNameMaster` に寄せるべき。

ただし、今回Task031ではコード変更しない。

実装時の安全方針:

- `subcategory` カラム、FormData、payloadはすぐ削除しない。
- 編集時に既存 `subcategory` があればstateには保持する。
- 表示だけ外しても、payloadに残せば既存保存互換を壊しにくい。
- 新規登録では空のままでよい。

推奨タイミング:

- Task033で標準カテゴリ・標準部品名selectを表示する。
- Task034で `standardPartNameId` / `gradeId` 保存を通す。
- その後のTask035で、ムーブメント情報内の旧 `subcategory` select を表示から外す。

## 既存PartsMasterデータとの関係

現時点ではアプリは業務未使用のため、既存業務データ保護よりも今後安全に使えるDB構造を優先する。

ただし、開発用データやテストデータが存在する可能性はあるため、以下の方針にする。

- 既存PartsMasterの `standardPartNameId` / `gradeId` はnullでもよい。
- 新規登録からDBマスター参照へ寄せる。
- 既存データをPartsForm保存時に勝手に推測補正しない。
- `nameJp` / `nameEn` / `grade` からの補正は後続Taskでdry-runを作る。
- 推測できたものだけ補完し、不明なものはnullのまま残す。

将来の補正軸:

- `nameJp` / `nameEn` と `PartNameMaster.nameJa/nameEn/displayJa/displayEn` の一致。
- `grade` と `PartGradeMaster.nameJa/nameEn/key` の一致。
- 旧 `partType` と新マスター `partType` の変換。
- 旧 `subcategory` は参考情報として扱うが、正の分類軸にはしない。

## PartsSearchPanel / PartsWebSearchPanelへの影響

Task031では変更しない。

後続で必要なこと:

- PartsSearchPanelは `standardPartNameId` / `gradeId` を検索条件に使えるようにする。
- 検索結果では `standardPartName` と `gradeMaster` を表示補助に使う。
- Web検索語生成では `PartNameMaster.nameEn` または `displayEn` を優先して使う。
- 既存 `nameJp` / `nameEn` は表示名・帳票名として残す。

## 実装Task分割案

### Task032: 標準マスター取得API追加

- `/api/master-data` に `partCategories`, `partNames`, `partGrades` を追加する。
- `isActive=true` の候補だけ返す。
- 既存 `brands`, `models`, `calibers`, `suppliers` は壊さない。
- UIはまだ変えない。

### Task033: PartsFormで標準マスター候補を読み込み表示する

- PartsFormのmasterData型を拡張する。
- `partType` から `part_internal` / `part_external` に変換する。
- `PartCategoryMaster` select を表示する。
- `PartNameMaster` select をカテゴリで絞る。
- `PartGradeMaster` select を表示する。
- この段階では保存payload変更を最小にし、表示とstate接続を主目的にする。

### Task034: PartsForm保存payloadに標準relationを追加する

- `standardPartNameId` と `gradeId` をpayloadに追加する。
- `src/lib/parts-master.ts` の入力型と保存dataを拡張する。
- `gradeId` 選択時に互換用 `grade` も保存する。
- `GET /api/parts` / `GET /api/parts/[id]` に `standardPartName` / `gradeMaster` includeを追加する。
- 不正IDの扱いを整理する。

### Task035: ムーブメント情報内の旧サブカテゴリselectを表示から外す

- `subcategory` select をUIから外す。
- state、payload、schemaは残す。
- 既存行の `subcategory` は編集時に保持する。

### Task036: PartsSearchPanelで標準マスターを利用する

- 検索APIで `standardPartNameId` / `gradeId` を受け取る。
- 検索結果に `standardPartName` / `gradeMaster` を含める。
- 文字列検索より標準ID検索を優先する。

### Task037: 既存PartsMaster補正dry-run

- 既存 `nameJp` / `nameEn` / `grade` から `standardPartNameId` / `gradeId` を推測する。
- 更新はせず、候補リストと不明リストを出す。
- 問題なければ後続Taskで補正実行する。

### Task038: Web検索語生成で標準英語名を使う

- `PartNameMaster.nameEn` / `displayEn` を検索語生成に使う。
- `nameJp` / `nameEn` は表示名として残す。

## 推奨方針まとめ

PartsForm接続の最小方針は以下。

- 既存 `partType` radio は維持する。
- DBマスター用には `interior/exterior` を `part_internal/part_external` に変換する。
- `PartCategoryMaster` はUIのカテゴリ絞り込みに使い、PartsMasterには保存しない。
- `PartNameMaster` は `standardPartNameId` としてPartsMasterへ保存する。
- `PartGradeMaster` は `gradeId` としてPartsMasterへ保存する。
- 既存 `grade` には互換用に `PartGradeMaster.nameJa` を保存する。
- `nameJp` / `nameEn` は標準名から初期入力するが、手入力欄は残す。
- 旧 `subcategory` select は後続Taskで表示から外す。
- 既存データ補正はPartsForm接続とは分け、dry-runから始める。
