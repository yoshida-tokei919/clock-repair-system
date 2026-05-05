# AI Task 009: 部品入力候補定義のレビュー・軽微修正

## 目的

AI Task 008で作成した `src/lib/part-input-options.ts` を、UI接続前にレビューする。

今回の主目的は、定義ファイルの内容が実務入力・今後のUI接続・PartsMaster検索に使いやすい状態か確認すること。

原則としてコード変更はしない。  
ただし、明らかなtypo、表記ゆれ、表示名の軽微修正、helper関数の安全性改善のみ許可する。

## ブランチ

feature/review-part-input-options-definition

## 触ってよい範囲

原則レビューのみ。

軽微修正が必要な場合のみ以下を変更してよい。

- `src/lib/part-input-options.ts`
- `docs/ai-tasks/009-review-part-input-options-definition.md`

## 触ってはいけない範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/*`
- `prisma/schema.prisma`
- API routes
- DB schema
- 保存ロジック
- 検索ロジック本体
- UI実装

## 前提

AI Task 008で以下を作成済み。

- `src/lib/part-input-options.ts`
- `PartInputType`
- `HandPosition`
- `MovementPartPosition`
- `MovementPartTarget`
- `PartCategoryOption`
- `PartNameOption`
- `PART_INPUT_TYPES`
- `PART_CATEGORIES`
- `PART_NAME_OPTIONS`
- helper関数

現在の方針：

- `part_internal` / `part_external` を使う。
- `internal` / `external` 単体は部品入力typeとして使わない。
- 外装カテゴリは時計の箇所で選ぶ。
- `gasket_screws_pins` は作らない。
- パッキン、ネジ、ピンは該当する時計箇所カテゴリに入れる。
- aliases は今回使わない。
- 検索用同義語は将来別Taskで扱う。
- 針は役割と位置を分けて保持する。
- 普通の穴石・受石と、耐震穴石・耐震受石は別部品として扱う。
- 耐震装置はテンプ、アンクル、ガンギに存在し得る。

## レビュー項目

### 1. 型定義の確認

以下を確認する。

- `PartInputType` が `"part_internal" | "part_external"` になっているか
- `HandPosition` が `center`, `1H`〜`12H` を持っているか
- `MovementPartPosition` が `upper | lower` になっているか
- `MovementPartTarget` が必要な対象を持っているか
- `PartNameOption` に以下があるか
  - `key`
  - `partType`
  - `categoryKey`
  - `nameJa`
  - `nameEn`
  - `displayJa?`
  - `displayEn?`
  - `handPosition?`
  - `movementTarget?`
  - `movementPosition?`

### 2. カテゴリ確認

外装カテゴリが以下であること。

- `case_glass`: ケース・風防
- `crown_tube`: リューズ・チューブ
- `pushers`: プッシャー
- `bezel`: ベゼル
- `dial_hands`: 文字盤・針
- `bracelet_band`: ブレス・バンド

内装カテゴリが以下であること。

- `mainspring_barrel`: 動力・巻上
- `train_wheel`: 輪列
- `escapement`: 脱進機
- `balance`: 調速機
- `keyless_works`: 針回し
- `calendar`: カレンダー
- `automatic_winding`: 自動巻
- `chronograph`: クロノグラフ
- `quartz`: クォーツ
- `main_plate`: 地板

### 3. 外装候補の確認

以下を重点確認する。

#### ケース・風防

- 風防 = プラスチック風防として扱えているか
- ガラス = ミネラルガラスとして扱えているか
- サファイアガラスが別候補になっているか
- ガラスパッキン、裏蓋パッキン、ケースネジ、裏蓋ネジなどが `case_glass` に入っているか

#### リューズ・チューブ

- リューズ
- リューズ（ねじ込み）
- チューブ
- チューブ（リューズ側ねじ）
- チューブ（ケース側ねじ）
- チューブ（ケース側ねじ・リューズ側ねじ）
- リューズパッキン
- チューブパッキン

上記が `crown_tube` に入っているか。

#### プッシャー

プッシャー関連が `pushers` にまとまっているか。

#### ベゼル

ベゼル、ベゼルインサート、回転ベゼル、ベゼルパッキン、ルミナスポイントが `bezel` に入っているか。

#### 文字盤・針

- 針が `nameJa` と `handPosition` に分かれているか
- `displayJa` が `秒針・6H` のようになっているか
- センター針が主要候補として入っているか
- 6Hや3Hなど、特殊針の候補も入っているか

#### ブレス・バンド

ブレス、バンド、コマ、クラスプ、バネ棒、エンドリンク、ピン、Cリング、ネジピンなどが `bracelet_band` に入っているか。

### 4. 内装候補の確認

重点確認：

#### 動力・巻上

- ゼンマイ
- 香箱
- 香箱真
- 角穴車
- 丸穴車
- コハゼ
- コハゼバネ
- 一番受け

#### 輪列

- 二番車
- 三番車
- 四番車
- 五番車
- 秒カナ
- 伝え車
- 出車
- 輪列受
- 各穴石上下

#### 脱進機

- アンクル
- ガンギ車
- 爪石
- アンクル受
- アンクル真
- アンクル穴石上下
- ガンギ穴石上下
- アンクル受石上下
- ガンギ受石上下
- アンクル耐震系上下
- ガンギ耐震系上下

#### 調速機

- テンプ
- テンプ一式
- 天真
- ヒゲゼンマイ
- 振り石
- 振座
- 緩急針
- テンプ穴石上下
- テンプ受石上下
- テンプ耐震系上下

#### 針回し

- 巻真
- ツヅミ車
- キチ車
- 小鉄車
- 日の裏車
- オシドリ
- カンヌキ
- カンヌキバネ
- 裏押さえ
- 筒カナ
- 筒車

#### カレンダー

- 日板
- 曜板
- 日送り車
- 日送り爪
- カレンダー押さえ
- 修正車

#### 自動巻

- ローター
- 自動巻受
- 切替車
- 巻上車
- 減速車
- ボールベアリング
- 爪レバー

#### クォーツ

- 回路
- コイル
- ステーター
- ステップローター
- キャパシタ

#### 地板

- 地板
- 文字盤止めネジ
- 機止めネジ
- 中心パイプ

### 5. 整合性チェック

以下を確認する。

- `key` に重複がない
- `categoryKey` が存在しない候補がない
- `partType` が `part_internal` / `part_external` 以外になっていない
- `aliasesJa` / `aliasesEn` が含まれていない
- `internal` / `external` 単体が部品入力typeとして使われていない
- `displayJa` がある候補はUI表示に使いやすい内容か
- `searchPartNameOptions` が `nameJa`, `nameEn`, `displayJa`, `displayEn` を検索対象にしているか

### 6. UI接続前の確認

次TaskでUI接続する前に、以下を確認する。

- `getPartCategoriesByType("part_external")` で外装カテゴリだけ取れるか
- `getPartCategoriesByType("part_internal")` で内装カテゴリだけ取れるか
- `getPartNamesByCategory("dial_hands")` で針候補が取れるか
- `searchPartNameOptions("秒針")` でセンター秒針・6H秒針などがヒットするか
- `searchPartNameOptions("shock")` で耐震系がヒットするか
- `searchPartNameOptions("リューズ")` でリューズ系がヒットするか

## 軽微修正を許可する条件

以下のみ修正可。

- typo
- 明らかな表記ミス
- keyの明らかなミス
- categoryKeyの誤り
- `displayJa` / `displayEn` の明らかな誤り
- helper関数の安全性改善

以下は禁止。

- 候補の大量追加
- カテゴリ再編
- aliases追加
- 検索ロジック追加
- UI接続
- DB接続
- API変更
- RepairEntryForm変更

## 完了条件

- レビュー結果が `docs/ai-tasks/009-review-part-input-options-definition.md` に記録されている
- 必要な軽微修正があれば `src/lib/part-input-options.ts` に反映されている
- 不要なコード変更をしていない
- `RepairEntryForm.tsx` を変更していない
- `PartsSearchPanel.tsx` を変更していない
- API routes を変更していない
- Prisma schema を変更していない
- `npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts` が通る
- `git status --short` で想定外の変更がない

## 確認コマンド

```bash
npx.cmd tsc --noEmit --skipLibCheck src/lib/part-input-options.ts
git status --short

可能なら簡易チェック用に Node / ts-node 等で件数集計してよい。
ただし一時ファイルを残さないこと。

Codexへの指示

まず以下を確認してください。

src/lib/part-input-options.ts
docs/ai-tasks/008-create-part-input-options-definition.md

今回はUI実装ではありません。

src/lib/part-input-options.ts をレビューし、UI接続前に問題がないか確認してください。

必要な場合のみ、typo・表示名・key・categoryKey・helper関数の軽微修正を行ってください。

Codexの返答形式

以下の形式で返してください。

実施内容
レビュー対象
カテゴリ確認結果
外装候補確認結果
内装候補確認結果
整合性チェック結果
UI接続前の確認結果
軽微修正の有無
変更ファイル
触っていない重要ファイル
確認コマンド
git status結果
未対応・注意点
カタリにレビューしてほしい点
Codexレビュー結果 2026-05-03

未記入。