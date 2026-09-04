# Task 110-0: 部品Web検索サイト別プロファイル調査

## 1. 目的

Phase 2「部品マスタ・部品検索・発注連携」の一部として、既存 `PartsWebSearchPanel` をできるだけ維持しながら、サイト別検索プロファイルを追加するための現状調査と実装計画をまとめる。

今回のTaskでは、検索UI・schema・APIの本実装は行わない。

## 2. 調査対象ファイル

- `AGENTS.md`
- `docs/ai/02_PRODUCT_ROADMAP.md`
- `docs/ai/03_CURRENT_TASK.md`
- `docs/ai/04_IMPLEMENTATION_RULES.md`
- `docs/ai-tasks/006-design-parts-search-to-order-flow.md`
- `docs/ai-tasks/020-investigate-web-search-area-for-parts-panel.md`
- `docs/ai-tasks/021-create-parts-web-search-panel-shell.md`
- `docs/ai-tasks/022-enable-web-search-sites-in-parts-web-search-panel.md`
- `docs/ai-tasks/023-investigate-part-web-search-query-generation.md`
- `docs/ai-tasks/024-fix-part-search-aliases-and-site-names.md`
- `docs/ai-tasks/027-5-audit-and-redesign-parts-master-masters.md`
- `docs/ai-tasks/036-design-parts-search-standard-master-integration.md`
- `docs/ai-tasks/109-0-investigate-existing-part-master-reuse.md`
- `docs/ai-tasks/109-1-compare-confirmed-internal-part-names.md`
- `docs/ai-tasks/109-2-design-internal-part-name-seed-diff.md`
- `docs/ai-tasks/109-3-seed-internal-part-name-diff.md`
- `src/lib/part-search.ts`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/lib/part-input-options.ts`
- `src/lib/parts-master.ts`
- `src/app/api/parts/route.ts`
- `src/app/api/parts/[id]/route.ts`
- `src/app/api/parts/search/route.ts`
- `src/app/api/master-data/route.ts`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `prisma/schema.prisma`

## 3. 現状のWeb検索データフロー

部品検索は2経路ある。

### 3.1 旧検索サイト選択ダイアログ

`RepairEntryForm` の明細行から部品検索ダイアログを開く。

主な流れ:

1. 明細行の検索操作で `partSearchRowIdx` をセットする
2. `activePartSearchItem = lineItems[partSearchRowIdx]` を取得する
3. 内装部品なら `movementMaker + movementCaliber` と `baseMovementMaker + baseMovementCaliber` を検索contextにする
4. 外装部品なら `brand + caliber` を検索contextにする
5. `buildJapanesePartQueries` / `buildEnglishPartQueries` で候補を生成する
6. `buildSearchUrls` がサイト言語に応じて JA / EN の先頭検索語を選ぶ
7. enabled なサイトを `window.open` で開く

この経路では、Repair画面のstateから以下を参照できる。

- `brand`
- `model`
- `refName`
- `caliber`
- `movementMaker`
- `movementCaliber`
- `baseMovementMaker`
- `baseMovementCaliber`
- 明細行 `name`
- 明細行 `partRef`
- 明細行 `partType`
- 明細行 `category`

ただし、メーカー公式部品名、search alias、PartsMaster由来の `nameEn` は明細行stateにない。

### 3.2 右部品パネル内 `PartsWebSearchPanel`

`RepairEntryForm` は `PartsSearchPanel` を開き、`PartsSearchPanel` の末尾で `PartsWebSearchPanel` を表示している。

現在 `PartsSearchPanel` から `PartsWebSearchPanel` へ渡しているprops:

- `watchRef={refKeyword}`
- `cal={calNumber}`
- `partType={partType === "all" ? initialPartType : partType}`
- `partName={keyword}`
- `disabled={loading}`

`PartsWebSearchPanel` 自体は以下のpropsを受け取れる。

- `brandName`
- `modelName`
- `watchRef`
- `cal`
- `partType`
- `categoryLabel`
- `partName`
- `partNameEn`
- `disabled`

つまり、コンポーネントのprops枠はあるが、現行接続では `brandName`、`modelName`、`categoryLabel`、`partNameEn` はほぼ渡っていない。

## 4. 今日の要件と現行実装の差分

### 4.1 明細1件ごとのWeb検索

要件:

- 部品Web検索は明細1件ごとに行う
- 複数部品を1つの検索語にまとめない

現行:

- 旧ダイアログは `partSearchRowIdx` により明細1件を対象にしている
- 右部品パネルも `partsPanelRowIdx` により明細1件を対象にできる

差分:

- 右部品パネル側は、明細行とRepair時計情報を十分に受け取っていない
- `partsSearchQuery` stateはあるが、実検索には使われていない

### 4.2 サイト別 internal / exterior profile

要件:

- 検索サイトごとに内装・外装の既定検索条件を持つ
- 案件内の一時変更とサイト既定値の変更を分ける

現行:

- `SearchSite` は `id/name/lang/url/enabled` のみ
- サイト別の検索語優先順位や使用トークン設定はない
- `buildSearchUrls` はサイトの `lang` だけで JA / EN 先頭検索語を選ぶ

差分:

- profile型が未定義
- 既存localStorage payloadとの後方互換設計が必要

### 4.3 各サイトに実際に渡す検索語の表示

要件:

- サイト行に「実際に渡す検索語」を検索前に表示する
- 詳細条件は「条件変更」時だけ展開する

現行:

- JA / EN候補は別枠で表示される
- サイト行にはURLは表示されるが、そのサイトに渡す確定検索語は表示されない

差分:

- `buildSearchUrls` の戻り値 `query` をサイト行へ表示すれば最小差分で対応可能
- 条件変更UIは未実装

### 4.4 内装 / 外装の検索軸

要件:

- 内装は `movementMaker + movementCaliber / partRef / partName` を主軸にする
- base movementがある場合は `baseMovementMaker + baseMovementCaliber` も使う
- 外装は `brand + watchRef / model / partRef / partName` を主軸にする
- 外装では `movementCaliber` を基本検索軸にしない

現行:

- 旧ダイアログの内装検索contextは movement / base movement を使っており、方向性は合う
- `part-search.ts` は `brand` という入力名を内装でも使うため、movementMakerをbrand扱いで渡している
- `PartsWebSearchPanel` 経由では movementMaker / baseMovementMaker / modelName / partRef が渡っていない

差分:

- `PartSearchInput` の語彙が新しいCal別PartsMaster設計に合っていない
- `partRef` と `partNameEn` を右パネル側へ渡す経路が不足している

## 5. 現在の `part-search.ts` とCal別PartsMaster設計の衝突

主な衝突は以下。

- `PartSearchInput` が `brand/watchRef/caliber/partName/partRef/partType/category` だけで、movementMaker / baseMovementMaker / baseMovementCaliber / modelName / partNameEn / manufacturerOriginalName / searchAlias を直接表現できない
- 内装でも `brand` 名の引数へ movementMaker を入れる形になっており、意味が読み取りづらい
- `buildJapanesePartQueries` / `buildEnglishPartQueries` は、brandVariantsが空の場合に候補が生成されにくい
- `buildSearchUrls` はサイトごとの差を `lang` だけで処理し、Cousins UKの部品番号重視、eBayの英語語順、Yahooの日本語語順などを表現できない
- 固定 `PART_NAME_EN_ALIASES` はDBマスタと未接続で、メーカー公式名称や検索aliasとは責務が違う
- `partNameEn` は `PartsWebSearchPanel` のfallbackでしか使われず、`part-search.ts` の入力にはない

ただし、既存関数は検索候補生成の土台として残せる。全面変更ではなく、profile対応の薄い関数を追加し、既存関数はfallbackとして維持するのが安全。

## 6. `PART_NAME_EN_ALIASES` の扱い

固定aliasは当面fallbackとして残せる。

残せる範囲:

- メーカー横断で名称が安定している一般部品
- `PartNameMaster.nameEn` / `displayEn` がない場合の補助
- 旧データや自由入力名から英語候補を作る最後のfallback

残すべきでない責務:

- メーカー公式部品名の代替
- Cal固有・メーカー固有部品の正式名称管理
- 検索サイト別の最適語順管理
- PROVISIONAL / VERIFIED の情報確度管理

## 7. 検索サイト設定の保存方式と最小変更案

現行保存方式:

- `PartsWebSearchPanel` は `repair-part-search-sites:v1` と `repair-part-search-sites:v1:parts-panel` に保存
- `RepairEntryForm` の旧ダイアログも `repair-part-search-sites:v1` を読む
- DB保存はない

現行 `SearchSite`:

```ts
type SearchSite = {
  id: string
  name: string
  lang: "ja" | "en"
  url: string
  enabled: boolean
}
```

最小変更案:

```ts
type SearchLanguage = "ja" | "en" | string

type SearchProfileToken =
  | "watchBrand"
  | "watchRef"
  | "modelName"
  | "movementMaker"
  | "movementCaliber"
  | "baseMovementMaker"
  | "baseMovementCaliber"
  | "partName"
  | "partNameEn"
  | "partRef"
  | "manufacturerOriginalName"
  | "searchAlias"
  | "cousinsNumber"

type PartNameMode = "partName" | "partRef" | "partNameAndPartRef"

type SearchSiteProfile = {
  lang?: SearchLanguage
  tokens: SearchProfileToken[]
  partNameMode?: PartNameMode
}

type SearchSite = {
  id: string
  name: string
  lang: "ja" | "en"
  url: string
  enabled: boolean
  profiles?: {
    internal?: SearchSiteProfile
    exterior?: SearchSiteProfile
  }
}
```

後方互換:

- `profiles` がないサイトは現行 `lang` と既存候補生成を使う
- localStorageのキーは短期では `repair-part-search-sites:v1` を維持する
- payload形状だけ拡張し、旧ダイアログ側のnormalizeでは未知フィールドを残せるようにする
- 将来DB保存が必要になるまでlocalStorage運用を維持する

## 8. 案件内一時条件とサイト既定条件の分離

分け方:

- サイト既定条件: `SearchSite.profiles.internal/exterior` としてlocalStorageへ保存
- 案件内一時条件: `PartsWebSearchPanel` のcomponent stateとして保持し、localStorageへは自動保存しない

UI案:

- サイト行には `site.name`, `lang`, 実際に渡す検索語, `条件変更`, `開く` を表示する
- `条件変更` でそのサイト・その検索だけの条件stateを展開する
- `この設定をこのサイトの既定値として保存` を押した場合だけ `SearchSite.profiles` へ反映する

実装上の推奨:

- `effectiveProfile = temporaryProfileBySiteId[site.id] ?? site.profiles?.[partDomain] ?? defaultProfile`
- 検索語生成は常に `effectiveProfile` から行う
- 既定値保存は明示操作だけにする

## 9. Web検索画面からPartsMasterを更新する既存API/action

存在するもの:

- `GET /api/parts`
- `POST /api/parts`
- `GET /api/parts/[id]`
- `PUT /api/parts/[id]`
- `DELETE /api/parts/[id]`
- `createOrUpdatePartsMaster`

既存APIで更新できる項目:

- `partRefs`
- `cousinsNumber`
- `nameJp`
- `nameEn`
- `notes1`
- `notes2`
- `standardPartNameId`
- `gradeId`
- その他 `PartsMasterInput` 全体

懸念:

- `PUT /api/parts/[id]` はフル更新で、`createOrUpdatePartsMaster` の重複解決ロジックも通る
- Web検索画面内の小領域から `partRef` だけ追記したい用途には強すぎる
- フルpayloadを用意しないと、意図せず空値で上書きするリスクがある

推奨:

- Web検索パネル用に対象フィールド限定の小さなAPI/actionを追加する
- 例: `PATCH /api/parts/[id]/search-info`
- 更新対象は短期では `partRefs`, `cousinsNumber`, `nameEn`, `notes1/notes2` のどれを使うか設計で確定したものに限定する
- `manufacturerOriginalName`, `searchAlias`, `sourceType`, `verificationStatus` は現行schemaにないため、今回確定しない

## 10. PROVISIONAL / VERIFIED の現行schema状況

現行schemaでは、部品マスタ用のPROVISIONAL / VERIFIED専用表現は未実装。

確認結果:

- `RepairWorkName` には `reviewStatus` / `source` がある
- `PublicCase` 系には `reviewStatus` / `sourceType` がある
- `PartCategoryMaster` / `PartNameMaster` / `PartsMaster` には `reviewStatus` / `source` / `sourceType` / `verified` 相当がない

したがって、Web販売ページ由来の `partRef` を「PROVISIONAL / 販売ページ由来」として正式に保存するschemaは未確定。

最小差分案:

- 短期実装では、確度管理をDBに確定せず、Web検索画面からの保存対象を限定する
- どうしてもメモが必要なら、既存 `notes1` / `notes2` に手入力で残す運用は可能だが、構造化された確度管理ではない
- 後続schema検討で `PartsMaster.reviewStatus`、`PartsMaster.sourceType`、または `PartEvidence` / `PartSource` のような別テーブルを検討する

## 11. 多言語部品名称の現行schema状況

現行schemaで持てるもの:

- `PartNameMaster.nameJa`
- `PartNameMaster.nameEn`
- `PartNameMaster.displayJa`
- `PartNameMaster.displayEn`
- `PartsMaster.nameJp`
- `PartsMaster.nameEn`
- `PartCategoryMaster.nameJa`
- `PartCategoryMaster.nameEn`

不足:

- ja/en以外の言語別名称
- 言語別search alias
- メーカー公式原語名
- サイト別に強い検索語

最小差分案:

- 短期では `nameEn` / `displayEn` を英語検索候補として優先利用する
- `SearchSite.lang` はUI上は当面 `ja | en` のままでも、設計型では `string` 拡張余地を残す
- de / fr / zh などは後続で `PartNameTranslation` / `PartSearchAlias` のような構造を検討する

## 12. 既存UIを維持できる範囲

維持できるもの:

- `PartsWebSearchPanel` の配置
- 検索条件表示
- 検索キーワード編集
- 日本語 / 英語候補表示
- サイト一覧
- サイトON/OFF
- JA / EN 指定
- サイト追加 / 削除
- 個別「開く」
- 選択サイト一括検索
- localStorage保存

最小変更で追加できるもの:

- サイト行に「実際に渡す検索語」を表示
- サイト別profileがない場合は従来候補の先頭を使う
- `条件変更` ボタンで詳細条件を展開
- 一時profile state
- 明示ボタンによるサイト既定profile保存

壊しやすいので後続に分けるべきもの:

- Web検索パネル内のPartsMaster編集
- PROVISIONAL / VERIFIED の構造化保存
- 多言語aliasのDB化
- `part-search.ts` の全面置換
- 旧検索サイト選択ダイアログ削除

## 13. 推奨実装順

### Task A: Web検索へ渡す検索contextを拡張

対象ファイル:

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsWebSearchPanel.tsx`

内容:

- 明細1件に対して `brand`, `watchRef`, `model`, `movementMaker`, `movementCaliber`, `baseMovementMaker`, `baseMovementCaliber`, `partRef`, `partName`, `partNameEn` を渡せるpropsを整理する
- UI表示変更は最小にする

### Task B: サイト別profile型と後方互換normalize

対象ファイル:

- `src/lib/part-search.ts`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`

内容:

- `SearchSite.profiles.internal/exterior` を任意フィールドとして追加
- 既存localStorage payloadを読み続ける
- `lang` は既存互換として維持

### Task C: profileから検索語を生成する薄い関数追加

対象ファイル:

- `src/lib/part-search.ts`

内容:

- 既存 `buildJapanesePartQueries` / `buildEnglishPartQueries` はfallbackとして残す
- `buildProfiledPartSearchQuery` のような単一サイト向け生成関数を追加
- 内装と外装の検索軸を分離する

### Task D: サイト行に実際の検索語を表示

対象ファイル:

- `src/components/parts/PartsWebSearchPanel.tsx`

内容:

- `buildSearchUrls` または新関数の戻り値 `query` をサイト行に表示
- 既存の日本語 / 英語候補表示は残す
- この段階では条件変更UIはまだ閉じたままでもよい

### Task E: 条件変更UIと案件内一時profile

対象ファイル:

- `src/components/parts/PartsWebSearchPanel.tsx`

内容:

- サイト行の `条件変更` でprofile詳細を展開
- maker/cal/ref系はcheckbox
- 部品名 / 部品番号 / 部品名 + 部品番号はradio/select
- 変更は一時stateに保持し、自動で既定値保存しない

### Task F: サイト既定profile保存

対象ファイル:

- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/lib/part-search.ts`

内容:

- `この設定をこのサイトの既定値として保存` でlocalStorageへ反映
- internal / exteriorのどちらへ保存するかを現在の `partType` から決める

### Task G: Web検索中の部品情報更新API設計・実装

対象ファイル:

- `src/app/api/parts/[id]/search-info/route.ts` など新規候補
- `src/lib/parts-master.ts` または専用helper
- `src/components/parts/PartsWebSearchPanel.tsx`

内容:

- `partRefs`, `cousinsNumber`, `nameEn` など検索中によく更新する項目だけを対象にする
- フルPartsMaster編集画面にはしない
- PROVISIONAL / VERIFIED はschema未整備なら構造化保存しない

### Task H: 保存後の検索語即時再生成

対象ファイル:

- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsSearchPanel.tsx`

内容:

- 保存した `partRefs` 等をpanel stateへ反映
- 再検索ボタンを押さなくてもサイト行の生成語へ反映されるようにする

## 14. リスク

- 旧ダイアログと右パネルが同じlocalStorageキーを使っているため、payload拡張時に旧normalizeがprofileを落とす可能性がある
- 右パネル経由ではRepair時計情報が不足しており、単純にprofileだけ追加しても検索語の質は上がらない
- 既存 `PUT /api/parts/[id]` をWeb検索小領域から使うと、意図しない上書きや重複解決が起きるリスクがある
- PROVISIONAL / VERIFIED は部品マスタschemaに未実装なので、先にUIだけ作ると確度表示が曖昧になる
- `PART_NAME_EN_ALIASES` を公式名称のように扱うと、メーカー固有名称と検索aliasが混ざる
- `interior/exterior`、`part_internal/part_external`、`internal/external` の値体系が混在しているため、変換helperなしで広げるとバグりやすい

## 15. 今回変更したもの

- `docs/ai/02_PRODUCT_ROADMAP.md`
- `docs/ai/03_CURRENT_TASK.md`
- `docs/ai-tasks/110-0-investigate-part-web-search-site-profiles.md`

## 16. 今回変更しなかったもの

- `prisma/schema.prisma`
- migration
- DB
- `src/lib/part-search.ts`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `src/app/api/*`
- `src/lib/*`
- PricingRule
- RepairWorkAction
- RepairWorkCategory
- PublicCase
- QR
- スケジュール
- 帳票
