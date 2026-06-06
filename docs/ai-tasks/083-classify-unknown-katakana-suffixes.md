# AI Task 083: 未知カタカナsuffix候補の分類と削除対象追加

## 目的

DB投入前の表示名生成ロジック最終確認として、Task 077で残っていた未知カタカナsuffix候補を分類し、FMP由来の読み仮名suffixとして安全に削除できるものを自動削除対象へ追加する。

## 前提

- 今回の処理はFMP過去案件の移行・救済専用
- DB接続・DB更新は行わない
- migration / seed は作成しない
- `prisma/schema.prisma` は変更しない
- CSV / Excel元データ本体は変更しない
- UIファイルは変更しない
- 新アプリ通常Repair側の構造化データ設計や `RepairEntryForm.tsx` には触らない

## FMP過去案件と新アプリ通常案件の切り分け

FMP過去案件と新アプリ通常Repair案件は、PublicCaseを作るまでの変換ルールを切り分ける。

- FMP過去案件: FMP専用ルールでPublicCaseに変換する
- 新アプリ通常Repair案件: 構造化データ・マスタからPublicCaseに変換する
- PublicCase化後: 同じB2C/B2B公開ページ、同じカードUIで扱う

今回触ったのはFMP過去案件の表示名生成・監査ロジックのみ。

## 077で残った未知suffix候補

Task 077時点では、主に以下の未知suffix候補が残っていた。

- ボウスイケンサ
- レイトツ
- オコマキシンジョキョ
- モジバンセッチャク
- ベルトゼンスウ
- シュウセイ
- フウボウケンマ
- セイサク
- カシメ
- ケンマ
- メッキ
- リダン
- イチバン
- オーバーホール

## 自動削除対象に追加したsuffix

以下をFMP由来の読み仮名suffixとして自動削除対象へ追加した。

- ボウスイケンサ
- レイトツ
- オコマキシンジョキョ
- モジバンセッチャク
- ベルトゼンスウ
- シュウセイ
- フウボウケンマ
- セイサク
- カシメ
- ケンマ
- メッキ
- イチバン

再生成後の自動削除suffixは647件。

## 保護対象に追加したsuffix

以下は作業名として必要なため、保護対象へ追加した。

- オーバーホール

再生成後、`オーバーホール` が表示名に残っていることを確認した。

## 判断保留にしたsuffix

以下は削除せず、review候補として残した。

- リダン: 2件

監査例は `文字盤リダン`。作業名として成立する可能性があるため、自動削除しない。

## 再生成したファイル

- `docs/data/fmp/generated/public-case-candidates.json`
- `docs/data/fmp/generated/public-case-candidates.sample.json`
- `docs/data/fmp/generated/public-case-candidates.csv`
- `docs/data/fmp/generated/public-case-display-name-cleanup-audit.json`
- `docs/data/fmp/generated/import-dry-run/import-summary.json`
- `docs/data/fmp/generated/import-dry-run/public-case-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/work-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/part-item-payload.sample.json`
- `docs/data/fmp/generated/import-dry-run/warning-payload.sample.json`

## 件数確認

再生成後の主要件数は以下。

- 公開候補Case件数: 2,924
- 内装候補明細: 2,624
- 外装候補明細: 711
- critical warning: 0
- importBlocked: false
- errors: 0

未知suffix候補は `リダン` の1種類、2件まで減少した。

## プレビュー確認

`/dev/public-case-gallery-preview` で以下が残っていないことを確認した。

- ボウスイケンサ
- オコマキシンジョキョ
- モジバンセッチャク
- ベルトゼンスウ
- フウボウケンマ
- シュウセイ
- セイサク
- カシメ
- ケンマ
- メッキ

また、`オーバーホール` が表示されていることを確認した。

## 変更しなかったもの

- DB接続・DB更新
- migration / seed
- Supabase接続
- `prisma/schema.prisma`
- CSV / Excel元データ本体
- UIファイル
- `src/app/(app)/dev/public-case-gallery-preview/page.tsx`
- `scripts/dry-run-import-fmp-public-cases.ts`
- `RepairEntryForm.tsx`
- `PricingRule`
- 既存公開ページ

## 次タスク案

- Task 084: 残存 `リダン` の扱いを業務判断する
- Task 085: FMP PublicCase本投入前の最終dry-runレビュー
- Task 086: PublicCase公開候補一覧UI設計
