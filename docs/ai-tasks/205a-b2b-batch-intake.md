# Task205A — B2B一括受付

Production: pending

## Scope

- 管理者が既存の取引先を選び、同一取引先の時計を1〜30本まとめて受付する。
- 時計ごとに取引先管理番号、エンドユーザー名、時計情報、受付メモを入力する。ブランドは必須。
- 成功時は全Repairの受付番号と案件リンクを一画面に表示する。
- schema / migration変更なし。既存のCustomer、Watch、Repair、RepairStatusLogを使用する。

## Invariants and validation

- APIと画面は管理者認証を要求する。APIはセッションのメールアドレスに対応するAdmin行も確認する。
- Customerは既存行で、`type=business`かつ`isPartner=true`、prefix設定済みでなければならない。取引先の新規作成は行わない。
- ブランドIDは既存の時計ブランド（`isWatchBrand=true`、`brandKind!=TYPE`）としてサーバーで検証する。候補外IDはバッチ全体を拒否する。
- サーバーの安全上限は1〜30本。文字列の型と長さを検証し、空欄をnullへ正規化する。
- 各Repairの初期statusとRepairStatusLog.statusはともに`受付`、`partsAllocationLegacy=false`。履歴の`changedBy`には実際のAdmin IDを保存する。
- 取引先の氏名・会社名、郵便番号、都道府県、市区町村、番地、建物、電話番号から、各Repairへ返送先snapshotを保存する。後日のCustomer変更で既存snapshotを更新しない。

## Atomicity and numbering

- 全時計のWatch、Repair、RepairStatusLog作成とCustomer.currentSeq更新は、1つのサーバートランザクション内で行う。途中失敗時は全件ロールバックする。
- Customer行を`FOR UPDATE`でロックしてから取引先と現在番号を再取得する。
- 採番開始値は`max(Customer.currentSeq, 同じprefixの既存Repair番号の最大連番)`。入力順に`PREFIX-###`を連続採番し、最後の番号をCustomer.currentSeqへ保存する。
- DBの一意制約違反とトランザクション競合はAPIで409として返す。通信結果不明または5xx時は画面からの盲目的な同一バッチ再送を止め、案件一覧で登録結果を確認する。

## Tests

- `src/lib/b2b-batch-intake.test.ts`: 1〜30本、必須ブランドと文字数、既存business partner、時計ブランドのDB条件、採番の両方向、単一トランザクションとロック順、初期status・履歴・返送先snapshot、後続行失敗と番号競合時の全件ロールバックを確認する。
- Focused tests: 6/6 PASS。Node test runnerは実行環境の`spawn EPERM`で起動できなかったため、process制限外でテストファイルを直接実行した。
- `npx tsc --noEmit`: PASS。
- `npx --no-install next build`: PASS。コンパイル・型検証・静的ページ生成57/57・build trace収集まで完走。`npm run build`はPrisma generateを伴うため、生成済みclientでの検証指示に従い、同等のNext.js production buildを直接実行した。
- `git diff --check`: PASS。

## Out of scope

- B2C受付・guard変更、取引先新規登録、専用バッチschema、見積・価格・修理明細。
- Shipment、PhysicalTag、StorageLocation、LINE、帳票・PDF、顧客通知への書き込み。
- commit、deploy、production DB変更。本Taskのproduction反映は別工程。
