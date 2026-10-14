# Task212A-FIX1 — 訪問しただけのステータス日付を保存対象から除外

Status: local implementation complete / Katari independent review complete  
Production: pending

Repair J-001 のステータス保存時、画面で一度選んだ「作業中」「作業完了」の未保存日付が履歴訂正として送られ、履歴不足で保存が拒否された。B2B E2E の進捗操作を続けるための局所修正。

- 日付訂正の送信対象を、保存済み `statusLog` にあるステータスと今回保存する最終ステータスに限定する。
- 保存直後の画面表示から、履歴にない中間ステータスの日付を除く。サーバーが正規化した場合は、要求ステータスの未採用日付も表示しない。
- サーバーの履歴不足拒否、受付日の制約、在庫によるステータス正規化は維持する。
- schema / migration / env / DB 変更なし。commit、deploy、production 確認は未実施。

## Local evidence

- Codex環境では最終再実行が `spawn EPERM`。カタリがPC上で `npx tsx --test src/lib/repair-status-transition.test.ts src/lib/repair-manual-status.test.ts` を直接実行し、正規化ケースを含む最終19件 PASS / 0 failed。
- カタリ独立差分レビュー完了。payload絞り込み・保存後表示・既存日付訂正・サーバー拒否維持を確認、blocking findingなし。実案件の再保存は未確認。
- `npx tsc --noEmit --incremental false --pretty false`: PASS。
- `git diff --check`: PASS。
