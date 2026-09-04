# Task 110-2: 部品Web検索 サイト別profile編集UI実装

## 目的

110-1で追加した `SearchSite.profiles.internal/exterior` と検索context土台を前提に、`PartsWebSearchPanel` にサイト別検索条件UIを追加した。

今回のTaskでは、条件変更はまず検索セッション内のtemporary profileへ反映し、明示操作した場合だけ該当site / 該当partTypeの保存済みprofileへ反映する。

Prisma schema、migration、PartsMaster更新API、Web検索画面からの部品番号保存は実装しない。

## 変更ファイル

- `src/lib/part-search.ts`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `docs/ai/03_CURRENT_TASK.md`
- `docs/ai-tasks/110-2-implement-part-web-search-profile-editor.md`

110-1から継続して以下の未コミット差分も前提になっている。

- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai/02_PRODUCT_ROADMAP.md`
- `docs/ai-tasks/110-0-investigate-part-web-search-site-profiles.md`
- `docs/ai-tasks/110-1-implement-part-web-search-context-and-profiles.md`

## 完成した通常表示

`PartsWebSearchPanel` のサイト一覧は、通常時は軽い表示を維持する。

- 有効/無効チェック
- サイト名
- JA / EN
- 実際に開く検索語
- `条件変更`
- `開く`
- `削除`

サイト行に表示される検索語と、個別 `開く` / `選択サイトを一括検索` で使うqueryは、同じ `buildProfiledSearchUrls` 経路から作る。

## internal条件UI

対象が internal の場合、`条件変更` を押したサイト行だけ以下を表示する。

検索に使用する軸:

- 時計ブランド
- ムーブメントメーカー
- Cal
- ベースムーブメントメーカー
- ベースCal

部品識別方法:

- 部品名
- 部品番号
- 部品名 + 部品番号

部品識別方法は radio で排他的に選ぶ。部品名と部品番号を独立checkboxにして重複指定できる構造にはしていない。

## exterior条件UI

対象が exterior の場合、`条件変更` を押したサイト行だけ以下を表示する。

検索に使用する軸:

- 時計ブランド
- 時計Ref
- モデル

部品識別方法:

- 部品名
- 部品番号
- 部品名 + 部品番号

exterior条件UIには `movementMaker` / `movementCaliber` / `baseMovementMaker` / `baseMovementCaliber` を通常表示しない。

## temporary profile管理

`temporaryProfiles` を `PartsWebSearchPanel` のcomponent stateとして追加した。

- 条件変更UIのcheckbox / radio変更は、保存済みsite profileを直接書き換えない
- 変更は現在の検索セッション用temporary profileへ即時反映する
- temporary profileは表示queryと実open queryの両方に反映される
- 明細contextが変わるタイミングではtemporary profileを破棄して、保存済みprofileを再読込する

## 既定profile保存

条件変更欄に `このサイトの既定値として保存` を追加した。

- temporary profileがある場合だけ押せる
- internal検索中なら `SearchSite.profiles.internal` だけ更新する
- exterior検索中なら `SearchSite.profiles.exterior` だけ更新する
- 反対側のprofileは上書きしない
- custom siteでも同じように保存できる
- 保存後は `repair-part-search-sites:v1` と `repair-part-search-sites:v1:parts-panel` へ反映する

## 保存済みに戻す

条件変更欄に `保存済みに戻す` を追加した。

- factory defaultへ戻す機能ではない
- 現在のtemporary profileを破棄し、保存済みsite profileを再適用する
- 保存済みprofile自体は削除しない

## manual keywordの扱い

既存の自由入力欄は `部品名の一時上書き` として整理した。

- 自動生成queryを基本にする
- 入力された場合は部品名として扱う
- JA / EN両サイトへ同じ日本語keywordを強制しない
- ENサイトでは `partNameEn` がある場合はそれを優先し、なければ既存alias fallbackを使う

## localStorage互換確認

- `PartsWebSearchPanel` の読み込みは `normalizeSearchSites` を使う
- `PartsWebSearchPanel` の保存は `persistSearchSites` 内で `normalizeSearchSites` を通す
- 旧Web検索ダイアログの読み込みとサイト追加も `normalizeSearchSites` を通す
- 旧payloadに `profiles` がなくても補完される
- 旧ダイアログが再保存してもprofilesが消えない経路になっている

## 欠損値の扱い

`buildProfiledPartSearchQuery` に、部品識別方法に必要な値が欠けている場合のguardを追加した。

- `partRef` 指定で部品番号がない場合は空queryにする
- `partName` 指定で部品名がない場合は空queryにする
- `partNameAndRef` 指定で両方ない場合は空queryにする
- `undefined` / `null` / 空文字はqueryへ混ぜない

UIでは、部品番号未登録、部品名未入力、部品名/部品番号未入力を小さく表示する。

## 検証

### pure function

`npx tsx -e` で以下を確認した。

- 旧SearchSite payloadにprofilesが補完される
- internal: `ETA 7750 8610`
- exterior: `ROLEX 16013 24-603`
- temporary profile相当のprofile指定で `ROLEX Datejust Crown`
- partRef指定で部品番号がない場合は空query

### typecheck

`npx tsc --noEmit --pretty false --incremental false` 成功。

### build

`npm run build` 成功。

補足: sandbox内では Prisma engine のネットワーク確認が `ECONNREFUSED 127.0.0.1:9` で止まったため、承認付きで再実行した。Next build中に既存の `/api/repairs/recent` 由来の dynamic server usage ログ、Browserslist警告、edge-server SIGTERMログが出たが、終了コードは0でビルドは完了した。

## 今回実装しなかったこと

- Prisma schema変更
- migration
- PROVISIONAL / VERIFIED実装
- manufacturer original name field
- search alias DB
- 多言語名称DB
- PartsMaster更新API
- Web検索画面からpartRef / nameEn / supplier番号保存
- PublicCase
- PricingRule
- 帳票
- QR
- スケジュール

## 次Task候補

1. Web検索画面からPartsMasterへ保存する対象項目と専用APIを設計する
2. partRef / cousinsNumber / nameEn の小さな保存UIを検討する
3. PROVISIONAL / VERIFIED / sourceType / searchAlias のschema方針を決める