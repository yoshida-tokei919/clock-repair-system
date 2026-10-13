# Task211C — 内装「動作修理」処置の追加

## 背景と境界

B2B E2Eの見積・作業入力で、既存の `repair`（修理）とは別に内装処置「動作修理」を選ぶ必要がある。ユーザー指定の表示名は「動作修理」、実装上の安定キーは `movement_repair`。既存処置の改名、外装への適用、カテゴリ・部品・価格ルールの変更は対象外。

## ローカル実装

- `RepairWorkAction`: `name=movement_repair`、`displayName=動作修理`、`sortOrder=25`、`isActive=true`。`repair=20` と `adjust=30` の間に置く。
- 通常seedとTask142復元importerの定義を一致させる。既存行のキー・順序は維持する。
- 内装処置の許可集合だけに追加する。外装では表示・使用しない。RepairEntryFormとScheduler設定は共有集合を参照する。
- schema / migration変更なし。既存明細のsnapshotやPricingRuleは書き換えない。

## Validation / review

- Codex実装: 対象test 7件、TypeScript型チェック、seed / 復元定義25件の一致確認はPASS。
- lintは設定がなく対話setupで停止したため未確認。設定を新規作成してTaskを拡大していない。
- カタリ独立差分レビュー: 内装だけへの追加、既存repair維持、共有候補 / Scheduler適用判定への接続、schema変更なしを確認。
- 初回表示名の誤りを指摘し、表示名・正本・Task内SQLを「動作修理」に修正。4コードポイントと定義一致を限定再確認、git diff --check PASS。
- 承認前の検証時点では本番DB書込み・deploy未実施。承認後の実施結果は次節に記録。

## Production: complete — 2026-10-14 JST

- User approved production master addition and push/deploy.
- Application commit: `2a26cfc7aa63f5627d57cc7922a73ec8bfa9022b`。
- Railway deployment: `5c2bca8b-b784-41c9-b91a-60cefd8571c8` — SUCCESS、region `sin`。
- Production master: `RepairWorkAction.id=25`、`name=movement_repair`、`displayName=動作修理`、`sortOrder=25`、`isActive=true`。既存repair / adjustを事前事後で確認、追加は1行のみ。
- Runtime smoke: `/`=200、`/login`=200、未認証 `/api/invoices/postal-print-targets`=401。
- 認証済み本番画面での候補表示は未確認。共有選択条件は対象testで内装許可 / 外装拒否を確認済み。
- Production tag: `production-task211c-20261014`。

### Reviewed production procedure (executed)

独立レビュー、ユーザー承認、対象環境と直前の行確認後、以下の手順で `RepairWorkAction` に**1行だけ**追加した。Task142の全foundation importer、通常seed、DB resetは実行していない。

事前read-only確認:

```sql
SELECT "id", "name", "displayName", "sortOrder", "isActive"
FROM "RepairWorkAction"
WHERE "name" IN ('repair', 'movement_repair', 'adjust')
   OR "sortOrder" = 25
ORDER BY "sortOrder", "name";
```

`movement_repair` が未存在で、`repair=20`、`adjust=30`、`sortOrder=25` の衝突がないことを確認する。条件が違う場合は停止して再検討する。承認後の対象限定write:

```sql
INSERT INTO "RepairWorkAction"
  ("name", "displayName", "sortOrder", "isActive", "createdAt", "updatedAt")
VALUES
  ('movement_repair', '動作修理', 25, true, NOW(), NOW())
RETURNING "id", "name", "displayName", "sortOrder", "isActive";
```

事後に同じread-only queryで既存 `repair` / `adjust` と新規1行を確認し、アプリ上で内装候補へ表示され外装候補には表示されないことを確認する。deploy・production smoke・記録後にproduction完了とする。
