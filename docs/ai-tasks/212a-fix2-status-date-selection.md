# Task212A-FIX2 — ステータス日付の変更時に対象ステータスを選択

Status: local implementation verified / production pending

案件詳細のステータス日付を選択・変更した際、既存の選択制限が許す場合に、その工程を保存対象のステータスとして選択する。カレンダーを開くだけでは切り替えず、保存は既存の保存ボタンで行う。

- ラベル選択と日付変更で「送付待ち」「受付」の既存選択制限を共用する。
- 日付入力が空になった場合はステータスを切り替えない。
- サーバーの検証、schema / migration / env / DB は変更しない。
- 認証済み実案件での再保存は未確認。

## Local verification

- Focused Node tests: 14 passed, 0 failed.
- `npx tsc --noEmit --incremental false --pretty false`: PASS.
- `git diff --check`: PASS.
