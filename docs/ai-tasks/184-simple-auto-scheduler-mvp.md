# Task184: シンプル自動スケジューラー MVP

## 対象と調査結果

Schedule MVP Step 3。既存の `Repair.scheduledDate`、`estimatedWorkMinutes`、`priorityScore`、`deliveryDateExpected`、`receptionDate`、`scheduleLocked` と Task183 の `WorkCalendar` を使用する。schema / migration / RLS / GRANT は変更しない。

- `src/lib/scheduling.ts` の `calculatePriorityScore` は顧客ランク等を仮定した試作で、Repair の更新経路から呼ばれていない。Task184では呼ばず、`priorityScore` の保存値だけで順位付けする。既定値0もそのまま扱う。
- 現行のRepair状態一覧には「作業待ち」「作業中」「作業完了」「納品済み」「キャンセル」「保留」「部品待ち」等がある。自動配置は状態が正確に「作業待ち」の案件だけに限定する。OrderRequestや部品情報から作業可否を推測しない。
- 対象外の進行中案件は、Repair.status・scheduleLocked・estimatedWorkMinutesだけを使うpure helperで理由を表示する。終端状態は対象外一覧から省く。固定案件は「予定日が固定」、作業待ちで想定時間0以下は「想定作業時間が未入力」とする。
- `scheduleLocked=true` は予定日を固定する既存の意味を維持する。終端状態（作業完了、納品済み、キャンセル）以外で予定日と正の想定時間がある固定案件は、日別容量から差し引く。
- WorkCalendarの例外rowがない日は480分。0〜1440分の例外値をそのまま用いる。日付はUTCのcalendar dateとして読み書きし、「今日」はAsia/Tokyoで決める。

## 配置規則

- 対象: `status === "作業待ち" && scheduleLocked === false && estimatedWorkMinutes > 0`。
- 順位: `priorityScore DESC`、`deliveryDateExpected ASC`（null後）、`receptionDate ASC`（null後）、`id ASC`。顧客区分による補正とスコア再計算はしない。
- 今日から180日間を対象に、各案件を全所要時間が入る最初の日へ1日単位で配置する。分割しない。
- 自動配置対象の未固定案件は既存予定日があっても再配置する。配置不可（`proposedDate=null`）なら理由を表示し、既存の `scheduledDate` を維持する。
- 配置不可理由は「想定時間が期間内のどの日の総作業可能時間にも入らない」または「総作業可能時間には入るが残りの空き時間が足りない」の2種類。
- `Repair.status`、`priorityScore`、`OrderRequest`、WorkCalendar自体は更新しない。

## プレビューと反映

- `/repairs/calendar` で明示的にプレビューし、案件別の現在日付・予定案・順位・時間、対象外理由、日別容量と固定/予定案の案件番号・分数、配置不可理由を確認してから反映する。
- 認証付き `GET /api/repairs/auto-schedule` はDBを変更せず、案とスナップショットのSHA-256 revisionを返す。
- 認証付き `POST /api/repairs/auto-schedule` はrevisionだけ受け取る。Serializable transaction内で案件とWorkCalendarを再読込・再計算し、revisionの相違や競合時は409とし、全更新をrollbackする。
- `proposedDate=null` は更新対象外とし、既存予定を消さない。
- 反映成功後は新しいプレビューを取得し、反映後の日別案を画面に残す。

## 範囲外

priorityScore計算式、顧客区分による優先補正、部品待ち判定、発注リードタイム、Shipment、ゆうプリR、LINE、帳票/PDF、分刻みガント、ドラッグ配置、AI最適化、マスタデータ投入。

## Local確認

- `npx tsx --test src/lib/simple-auto-scheduler.test.ts src/lib/work-calendar.test.ts src/lib/repair-schedule.test.ts`: 15 / 15 PASS。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS。
- ローカル `npx next build`: build worker起動時に実行環境の `spawn EPERM`。assertion failureではない。
- 独立レビューで、配置不可時に既存 `scheduledDate` を消し得る問題を発見し、修正後に再テスト済み。

## Production

- Application commit: `1b66b0bef90aceb4e8935246797acf094145ecf7`
- Commit subject: `feat: add simple auto scheduler MVP`
- Deploy source: GitHub `main` → Railway automatic deployment
- Railway deployment: `0c4bcef6-f4c0-44c9-8826-ba4060bac15e`
- Deployment status: `SUCCESS`
- Production tag: `production-task184-20260925`
- Region: `sin`
- schema / migration / RLS / GRANT変更: なし
- Production backup: migrationなしのため不要
- Railway runtime: `next start` 正常起動、`Ready in 342ms`
- Non-destructive smoke:
  - `/` = 200
  - `/login` = 200
  - unauthenticated `/repairs/calendar` = 307 → `/api/auth/signin?callbackUrl=%2Frepairs%2Fcalendar`
  - unauthenticated `GET /api/work-calendar?month=2026-09` = 401
  - unauthenticated `GET /api/repairs/auto-schedule` = 401

Production: complete.
