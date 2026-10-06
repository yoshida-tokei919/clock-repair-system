# Task205C — B2B一括受付の検索・自由入力マスター

Production: complete

## Scope

- `/repairs/b2b-intake` の時計ブランド、モデル、Ref、時計Cal、ムーブメントメーカー・Cal、ベースメーカー・Calを、現在の入力文字列全体で候補を絞る自由入力コンボボックスへ変更。
- 時計ブランド候補は `isWatchBrand=true` かつ `brandKind!=TYPE`。名前、日本語名、英語名、かな、aliasを検索する。既存候補の選択ではbrandIdを保持してTask205Bの段階入力を維持する。
- ムーブメントメーカー候補は `isMovementMaker=true` かつ `brandKind!=TYPE`。選択したメーカーのCal候補は `Caliber.brandId` で絞る。
- バッチpayloadへブランド自由入力名、ムーブメントメーカー・Cal、ベースメーカー・Cal、`workSummary`を追加。既存brandId入力を保持する。
- 候補は矢印キーで移動し、Enterで選択、Escapeで閉じる。候補選択時のEnterではformを送信しない。自由入力値は登録ボタンから送信できる。
- brandIdが指定された場合は正のsafe integerを要求する。brandIdとbrandNameの両方がある場合は正本名またはaliasの解決結果が同じブランドIDであることを確認し、不一致はバッチ全体を拒否する。
- 最終送信時の単一transaction内でブランド・モデル・Ref・Calを解決または作成。TYPEブランドとの正規化名衝突はバッチ全体を拒否する。新規Refには選択した時計Calを紐づける。
- 登録成功後はserver propsをrefreshし、新規登録された時計ブランド・ムーブメントメーカー・Calを同じ画面の次バッチでも候補へ反映する。
- 各時計の `依頼内容` テキストエリアを `Repair.workSummary` に保存。旧受付メモ入力を除去し、B2B一括受付から `Repair.internalNotes` へ入力値を書き込まない。
- Task205Aの採番、Watch・Repair・RepairStatusLog、返送先snapshot、通信結果不明時の再送防止を維持。schema・migration・RLS・GRANT変更なし。

## Validation

- `node node_modules/typescript/bin/tsc --noEmit`: PASS。
- Focused batch 11/11、drilldown 8/8、master normalize 2/2: PASS。process sandbox内ではNode test runnerの `spawn EPERM` となり、sandbox外で再実行してPASSした。
- `node node_modules/next/dist/bin/next build`: PASS。コンパイル、型チェック、静的ページ57/57、build trace収集完了。process sandbox内では `spawn EPERM` となり、同じローカルworktreeでsandbox外から再実行した。
- `git diff --check`: PASS。

## Production

- Status: complete.
- Application commit: `3cdb8e1bb1cd72ce039f0d625dbcbf188c509b76` (`feat: improve B2B intake master entry`).
- Railway deployment: `a1e2ddd3-26c5-43d9-82e7-398f1bc371e7` — SUCCESS.
- Production tag: `production-task205c-20261006`.
- Local validation: focused tests 21/21 PASS（batch 11/11、drilldown 8/8、master normalize 2/2）、TypeScript PASS、`git diff --check` PASS、Next.js production build PASS（static pages 57/57）。
- Railway production build: Prisma generate / Next.js compile / lint・type check / static pages 57/57 / build trace collection PASS.
- Production runtime: Next.js 15.5.27、`Ready in 257ms`、deployment status SUCCESS.
- Production smoke: `/`=200、`/login`=200、`/repairs`未認証=307、`/repairs/b2b-intake`未認証=307。productionデータを増やさないためB2B一括受付POSTの実mutation smokeは未実施。
- schema / migration / RLS / GRANT / production DB変更なし。
- Final read-only review: blocking findingなし。実装担当Codexとは分離して最終差分を確認済み。
