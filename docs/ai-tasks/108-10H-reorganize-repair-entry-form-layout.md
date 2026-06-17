# AI Task 108-10H: RepairEntryForm 左側情報エリアの余白活用・見積り明細の上詰めレイアウト改善

## 目的

108-10Gの視認性改善を前提に、RepairEntryFormの左側情報エリア内の余白を活用し、見積り・修理明細を上方へ詰める。

今回の最重要条件は以下。

```txt
見積り・修理明細の横幅は狭めない
```

## 変更ファイル

- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai-tasks/108-10H-reorganize-repair-entry-form-layout.md`

## 108-10G完了後の前提

108-10Gで以下は対応済み。

- 共有ページコメント欄を初期1行要約 + 開閉式へ変更
- 見積・修理明細の文字と入力欄を拡大
- 構造化作業入力欄を3列 + detail横幅いっぱいへ変更
- ステータスバーは変更なし

今回もこの状態を維持し、保存処理・DB・API・帳票・部品検索ロジックには触れていない。

## 顧客情報だけを横詰めした内容

顧客情報カードだけ、カード内部の余白を使って横詰めした。

PC幅では以下のように複数列で並ぶ。

```txt
顧客 / エンドユーザー / 管理番号
LINE ID / TEL
住所
```

住所は横幅を広めに使う。

スマホ幅では縦積みに戻る。

保存項目やpayloadは変更していない。

## 時計情報を2列化せず縦並び維持したこと

時計情報の入力項目は、2列化していない。

維持した並び:

```txt
ブランド
モデル
Ref
Cal
ムーブ製造元
ムーブCal
ベース製造元
ベースCal
シリアル
付属品
```

ブランド横にモデルを並べる、Ref横にCalを並べる、といった変更はしていない。

## 時計情報カード内の右余白へ正面写真を配置した内容

時計正面写真は、右側作業エリアの独立カードではなく、時計情報カード内の右側余白へ移した。

表示方針:

- `photos[0]` を正面写真として1枚だけ表示
- 写真一覧にはしない
- 写真管理機能の代替にしない
- `object-contain` で時計全体が見えるようにする
- 写真タブ・アップロード処理・削除処理・ストレージ処理は変更しない

写真がない場合は、時計情報カード内に小さめの `正面写真なし` プレースホルダーを表示する。

## 見積り・修理明細の横幅を維持したこと

見積り・修理明細の右側作業エリアの横幅は狭めていない。

写真のために右側作業エリア内に新しい列や独立写真エリアを追加せず、写真を左側の時計情報カード内へ移した。

## 見積り・修理明細を上方へ詰めた内容

右側作業エリア上部に置いていた独立の時計正面写真カードを削除した。

その結果、右側作業エリアは以下の順になる。

```txt
見積り・修理明細
部品パネル
将来ボタン群の配置余地
```

見積り・修理明細は右側作業エリアの上部から始まる。

## 部品パネルの位置

部品パネルは、見積り・修理明細の下側に配置した。

検索ロジック、候補表示、PartsMaster連携、partsMasterIdの扱いは変更していない。

## 将来ボタン群の配置余地

右下に将来の案件処理ボタン群を置きやすいよう、部品パネル下にコメントだけを残した。

```tsx
{/* future action buttons area */}
```

今回、定型コメント挿入・定型納期挿入・WEB公開ボタンなどの処理やUIは実装していない。

## 共有コメント欄を横幅いっぱい常時表示に戻していないこと

108-10Gで整理した共有ページコメント欄は維持した。

- 初期状態は1行要約
- コメント件数と未読件数を表示
- 開いた時だけコメント一覧・返信欄・返信ボタンを表示

横幅いっぱいの常時表示には戻していない。

## ステータスバーを変更していないこと

ステータスバーは変更していない。

- 削除していない
- 折りたたんでいない
- 大幅なコンパクト化をしていない
- 表示内容・意味を変えていない

## PartsMaster / getPartsMatched / PartsSearchPanel を変更していないこと

以下は変更していない。

- PartsMaster検索ロジック
- `getPartsMatched`
- `PartsSearchPanel`
- 部品候補表示仕様
- partsMasterId の扱い
- 部品パネルの検索仕様

## partsMasterId と targetPartNameId を混同していないこと

今回も以下の区別を維持した。

```txt
targetPartNameId
→ 技術料行の「作業対象部品」
→ PartNameMaster由来

partsMasterId
→ 交換部品行の「実際に使う部品」
→ PartsMaster由来
→ 部品検索・在庫・発注と関係する
```

構造化作業入力欄は技術料行だけに表示され、交換部品行には表示しない。

## 変更していないもの

- schema
- migration
- seed
- DB
- API route
- 帳票
- PDF
- LINE
- 共有ページ
- PublicCase
- EstimateItem schema
- PricingRule検索ロジック
- PricingRule.suggestedWorkName
- RepairLineItem保存仕様
- relatedWorkLineItemId
- PartsMaster検索ロジック
- getPartsMatched
- PartsSearchPanelの検索仕様
- partsMasterIdの扱い
- targetPartNameIdの保存仕様
- ステータスバー
- 写真アップロード処理
- 写真管理機能
- ストレージ処理

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
npx prisma generate
npx tsc --noEmit --pretty false --incremental false
```

`npx prisma generate` は、既存dev serverが Prisma Client をロックしていたため初回 `EPERM` になった。ローカルdev serverプロセスのみ停止後、再実行して成功した。

以下でdev serverを確認する。

```powershell
npm run dev -- -p 3011
```

確認結果:

- `Test-NetConnection localhost -Port 3011`: `TcpTestSucceeded: True`
- `http://localhost:3011/repairs/new`: HTTP 307（ログインリダイレクト）

## 未確認点

- ログイン後の `/repairs/new` 実画面の最終目視
- 既存案件詳細 `/repairs/[id]` の最終目視
- 写真あり案件での時計情報カード内正面写真表示
- スマホ幅での最終表示

## 次Task案

- Task 108-10I: ログイン後のRepairEntryForm実画面確認と細部調整
- Task 108-11: 構造化作業入力の保存payload・価格候補導線の整理
