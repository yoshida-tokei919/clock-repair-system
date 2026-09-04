# Task 110-1: 部品Web検索 context拡張とサイト別profile土台実装

## 目的

Phase 2「部品マスタ・部品検索・発注連携」のうち、部品Web検索で明細1件ごとの検索contextを安全に渡し、検索サイトごとに internal / exterior の既定検索profileを持てる土台を実装した。

今回のTaskでは、UI上の大きな条件編集機能、Prisma schema / migration、PartsMaster更新APIは実装しない。

## 変更ファイル

- `src/lib/part-search.ts`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai/03_CURRENT_TASK.md`
- `docs/ai-tasks/110-1-implement-part-web-search-context-and-profiles.md`

## 実装内容

### 1. SearchSite profile型

`SearchSite` に任意の `profiles` を追加した。

- `profiles.internal`
- `profiles.exterior`
- `tokens`
- `partIdentifierMode`
- `lang`

既存の `id/name/lang/url/enabled` は維持し、古い localStorage payload も `normalizeSearchSites` で読み込めるようにした。

### 2. 既定profile

既定profileは以下の方針にした。

- internal: 原則 `movementMaker + movementCaliber + partRef/name`
- exterior: 原則 `watchBrand + watchRef + partRef/name`
- Cousins UK internal: 部品番号検索を優先するため `partRef` 中心

`SearchSite.lang` は既存UIの JA / EN 切替として維持し、検索語生成時にも優先される。

### 3. 検索context拡張

`PartSearchContext` を追加し、以下を扱えるようにした。

- `brand` / `watchBrand`
- `watchRef`
- `model`
- `caliber`
- `movementMaker`
- `movementCaliber`
- `baseMovementMaker`
- `baseMovementCaliber`
- `partType`
- `category`
- `partName`
- `partNameEn`
- `partRef`

### 4. 検索語生成

`buildProfiledPartSearchQuery` と `buildProfiledSearchUrls` を追加した。

- internal / exterior の検索軸を `normalizePartSearchDomain` で分離
- internal では時計ブランドを主軸にしない
- exterior ではムーブメントCalを主軸にしない
- 既存の `buildJapanesePartQueries` / `buildEnglishPartQueries` / `buildSearchUrls` は互換用に維持

### 5. Repairから右部品パネルへの接続

`RepairEntryForm` から `PartsSearchPanel` へ、さらに `PartsWebSearchPanel` へ以下を渡すようにした。

- 時計側: `brand`, `model`, `refName`, `caliber`
- ムーブメント側: `movementMaker`, `movementCaliber`, `baseMovementMaker`, `baseMovementCaliber`
- 明細側: `partRef`, `partName`, `partNameEn`

### 6. localStorage互換

旧ダイアログと右部品パネルが同じ `repair-part-search-sites:v1` を使うため、旧ダイアログ側も `normalizeSearchSites` を使うようにした。

これにより、古い `profiles` なしのサイト定義は読み込み時に既定profileが補完される。

## 検証

### pure function検証

`npx tsx -e` で以下を確認した。

- `profiles` なしの旧サイト定義に `profiles.internal/exterior` が補完される
- internal 検索: `Hamilton` の時計でも `ETA 7750 8610` になり、時計ブランドに寄らない
- exterior 検索: `ROLEX 16233 24-603-8` になり、時計ブランド/Refに寄る
- `site.lang = ja` では日本語部品名が使われる

### 型チェック

`npx tsc --noEmit --pretty false --incremental false` 成功。

### build

`npm run build` 成功。

補足: sandbox内では Prisma engine のネットワーク確認が `ECONNREFUSED 127.0.0.1:9` で止まったため、承認付きで再実行した。build中に既存の `/api/repairs/recent` 由来の dynamic server usage ログが出たが、終了コードは0でビルドは完了した。

## 今回実装しなかったこと

- Prisma schema変更
- migration作成
- PartsMaster更新API
- Web検索画面からの `partRefs` / `cousinsNumber` / `nameEn` 保存
- PROVISIONAL / VERIFIED のDB表現
- サイト別profile編集UI
- PublicCase / QR / スケジュール / 帳票 / PricingRule / 作業マスタ変更

## 次のTask候補

1. サイト別profile編集UIを追加する
2. Web検索結果からPartsMasterへ保存する対象項目と専用APIを設計する
3. PROVISIONAL / VERIFIED / sourceType / searchAlias のschema方針を決める