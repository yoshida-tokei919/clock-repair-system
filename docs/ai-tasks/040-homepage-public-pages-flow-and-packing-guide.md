# トップページ・公開詳細ページ・修理の流れ統合・梱包案内の記録

## 1. 背景

トップページから6カード詳細ページを追加したあと、公開ページ群の文言を実務に合わせて見直した。

その過程で、「修理の流れ」と「安心してご相談いただくために」の内容が重複していたため、お客様が一読で流れと注意点を理解できるように情報を整理した。

また、郵送時の梱包方法について、専用のインフォグラフィック画像と案内ページを追加した。

## 2. 主な方針

- 情報を増やすより、重複を削って簡潔にする
- 「一読で理解できる」公開ページを目指す
- 不安は先に潰すが、注意書きだらけにしない
- 型番が分からなくても相談できる印象にする
- 安売り感や過剰保証に見える表現は避ける
- B2C向けには、LINE相談への心理的ハードルを下げる
- B2B向け導線は `/cases/biz` に維持する

## 3. 実装した主な変更

### 3-1. 公開ページ文言の整理

対象ファイル:

- `src/app/page.tsx`
- `src/app/line-consultation/page.tsx`
- `src/app/difficult-repair/page.tsx`
- `src/app/about-technician/page.tsx`
- `src/app/parts-sourcing/page.tsx`
- `src/app/waterproof-check/page.tsx`
- `src/app/price-quality/page.tsx`
- `src/app/repair-flow/page.tsx`
- `src/app/reassurance/page.tsx`

内容:

- 屋号表記を「ヨシダ時計修理工房」に統一
- 「写真・型番・症状」前提の文言を、「時計の写真や分かる範囲の情報」へ調整
- 「難修理への対応」を「修理の可能性を探す」寄りの表現へ変更
- 価格訴求を「必要な作業を見極め、費用と仕上がりのバランス」寄りに調整
- トップの肩書き「修理歴20年・1級時計修理技能士」を大きくした

### 3-2. `/repair-flow` への統合

対象ファイル:

- `src/app/repair-flow/page.tsx`
- `src/app/reassurance/page.tsx`
- `src/app/page.tsx`

内容:

- `/repair-flow` を「詳しい流れとポイント」として再構成
- 01 LINE相談 から 08 納品・保証 までの8ステップに整理
- `/reassurance` は `/repair-flow` へ `redirect` する最小実装に変更
- トップページの「安心してご相談いただくために」セクションを削除
- トップページの「修理の流れ」セクションを「修理の流れとポイント」に変更
- トップページ側のステップも8ステップへ整合

8ステップ:

1. LINE相談
2. 概算案内
3. 郵送
4. 受付
5. 正式見積り
6. 承認・キャンセル
7. 修理
8. 納品・保証

### 3-3. 梱包方法ページ追加

対象ファイル:

- `src/app/packing-guide/page.tsx`
- `src/app/repair-flow/page.tsx`
- `public/img/watch-shipping-packaging-guide.png`

内容:

- `/packing-guide` を新規追加
- `/repair-flow` の「03 郵送」セクションから「梱包方法を見る」導線を追加
- 梱包インフォグラフィック画像を追加
- 画像は `.gitignore` の `*.png` により無視対象だったため、`git add -f` で個別追加

画像パス:

- `public/img/watch-shipping-packaging-guide.png`

表示URL:

- `/img/watch-shipping-packaging-guide.png`

## 4. 梱包案内ページの主な内容

- お手元の箱や緩衝材で安全に送れること
- 金属ベルトの時計は、裏蓋とベルトが擦れないように腕を通す部分にも緩衝材を入れること
- チャック付き袋に入れることで、雨濡れや外れた部品の紛失対策になること
- 発送時は「壊れもの」指定をお願いすること
- 送付時の送料はお客様負担、修理完了後の返送料は当工房負担であること
- 梱包方法が不安な場合はLINEで相談できること

## 5. commit履歴

今回関連する主なcommit:

- `fc89f28` Refine public page messaging and repair flow
- `990d364` Add watch shipping packing guide

直前までの関連commit:

- `7371954` Fix business cases login redirect
- `3d2e570` Add detail links to homepage FAQ
- `0b83fc8` Add reassurance detail page
- `90f16f0` Add repair flow detail page
- `cc22561` Add price and quality detail page
- `22ce2e8` Add waterproof check detail page
- `65aaea9` Add parts sourcing detail page
- `5a4c64d` Add technician detail page
- `30eda94` Add difficult repair detail page
- `a5fd6d2` Add LINE consultation detail page
- `9d39607` Update homepage service card messaging

## 6. 確認結果

- `npx.cmd tsc --noEmit` 成功
- 本番へ push 済み
- `/repair-flow` 表示確認
- `/packing-guide` 表示確認
- スマホで問題なし
- `/repair-flow` の「梱包方法を見る」から `/packing-guide` へ遷移確認
- 梱包画像表示確認
- `.next-dev.err.log` は既存dirtyのためcommit対象外

## 7. 今後の改善候補

- `/repair-flow` の文章をさらに短くする余地あり
- 梱包インフォグラフィックの微修正は後日検討
- 詳細ページ間でCSS重複があるため、将来的には共通化検討
- `/price-quality` の価格表に更新日や注記を追加検討
- 画像を使う詳細ページを増やす場合は、`*.png` が `.gitignore` 対象である点に注意
- 画像ファイルを追加する場合は `git add -f` が必要
