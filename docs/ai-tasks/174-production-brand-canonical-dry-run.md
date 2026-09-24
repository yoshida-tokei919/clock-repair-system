# Task174: production Brand canonical dry-run 調査記録

## Scope

docs-only investigation。対象は production の Brand / BrandAlias 現況、canonical seed の動作、dry-run の到達状況、2026-09-12 backup との照合を記録すること。production への書き込みは行わない。

## Production baseline

- Task174 開始時の local `HEAD`: `a0b6beb` (`docs: audit master recovery sources and drilldowns`)。local `main` は `origin/main` より 1 commit 先で、作業ツリーは clean。
- `origin/main`: `c674be7` (`feat: add related repair case links`)。
- `stash@{0}: accidental-copilot-task3-20260924` は untouched。
- Railway project: `a5241b0d-4326-49ba-9e83-ff3221584121`。
- Railway environment: production `dd36d737-64a9-4e12-9c09-5a1dc6dc505f`。
- Railway service: `clock-repair-system` `aac9dbdd-ddd0-4c09-a1b2-816f27271d81`。
- Active deployment: `c674be7c0d70e697bda787d9c28dc35e6c928240`、`SUCCESS` / `RUNNING`。
- Supabase project: `vpyjonjfpkpbvvjufbiu`、`ap-northeast-1`、`ACTIVE_HEALTHY`。
- 2026-09-24 06:12:29 UTC の Supabase read-only SQL で、production `Brand=0`、`BrandAlias=0` を確認。

## Seed behavior audit

`scripts/seed-canonical-brands.ts` は既定で dry-run。書き込みを有効にする引数は `--apply` のみ。dry-run は canonical alias の競合を検証し、既存 `Brand` / `BrandAlias` を SELECT し、計画を表示して transaction 前に return する。apply の transaction は不足する Brand の作成、canonical fields の更新、不足する alias の作成を行う。既存の `isMovementMaker=true` は false に戻さない。

この seed の apply には Task142 importer と同等の、明示的な production 二重確認 guard がない。Task174 では `--apply` を実行しない。

## Canonical source counts

canonical pure-source calculation の結果:

| 項目 | 件数 / 値 |
| --- | ---: |
| Brand | 297 |
| normalized Alias | 581 |
| conflicts | 0 |
| movement makers | 3: ETA, ROLEX, SEIKO |
| watch brands | 296 |

## Production dry-run attempt and limitation

- production `DATABASE_URL` を使う `railway run` は書き込みを行っていない。Prisma が pooler port `6543` への接続で失敗し、query 完了前に終了した。
- 接続文字列の値・資格情報を表示せず変数の接続先を調べた結果、`DATABASE_URL` は同じ Supabase pooler の port `6543`、`DIRECT_URL` は同じ pooler の port `5432` を使用していた。
- 後続の PC からの TCP check は `5432` と `6543` の両方で成功した。この試行を DB outage の証拠とはしない。
- `DIRECT_URL` を使う child wrapper は有用な出力を残さず exit code `1` で終了し、書き込みは行っていない。
- Railway SSH 経路は SSH key が登録されていないため使っていない。key は追加しない。

**production に対して seed script の literal dry-run が正常完了したという結果はない。**

## Deterministic equivalent dry-run plan

production の `Brand` と `BrandAlias` がともに 0 件であることを Supabase read-only SQL で直接確認済みであり、canonical source は Brand 297 件、normalized Alias 581 件、競合 0 件である。監査した seed logic から、現時点の入力に対する期待計画は次のとおり。これは **deterministic equivalent dry-run plan** であり、production に対する script の literal 出力ではない。

| field | expected value |
| --- | ---: |
| mode | `dry-run` |
| canonicalBrandCount | 297 |
| CREATE | 297 |
| UPDATE | 0 |
| aliasCreate | 581 |
| SKIP | 0 |
| movementMakerTruePreserved | 0 |
| conflicts | 0 |

## 2026-09-12 backup comparison

対象: `C:\Users\yoshi\clock-repair-backups\20260912\production-pre-task163-165.dump`。read-only `pg_restore` の raw UTF-8 再監査で、`Brand` COPY rows は 297、`BrandAlias` COPY rows は 581。旧記録の Alias 539 件は誤りで、正しくは 581 件。

| 比較対象 | dumpRows | canonicalRows | missing | extra | 差異 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Brand | 297 | 297 | 0 | 0 | fieldMismatch 0 |
| BrandAlias | 581 | 581 | 0 | 0 | aliasTextDiff 0 |

Brand の比較対象 fields は `nameEn`、`nameJp`、`brandKind`、`isWatchBrand`、`isMovementMaker`。BrandAlias の key は `normalizedAlias` で、表示用 `alias` 文字列も一致した。結論として、9/12 backup の Brand / BrandAlias は、比較した fields / aliases において現 canonical と完全一致する。

Task173 の旧 commit `7607aba` は push 前に amended commit `a0b6beb` に置き換えられ、誤った Alias 539 件と、そこから生じた 42 件差の前提が訂正された。Task174 では Task173 を編集しない。

## Safety assessment

Task174 は production write を行っていない。seed の `--apply` は実行していない。production Brand / BrandAlias import は high risk であり、実際の書き込みは Yoshida の明示承認 gate で止める。

## Next production-write gates

1. 別の production-write Task で、実行直前の production `Brand` / `BrandAlias` 件数を再確認する。
2. 新しい production backup を作成する。
3. apply 前に `seed-canonical-brands.ts` へ明示的な production confirmation guard を追加することを推奨する。代わりに同等の guarded procedure を定義してもよい。
4. 書き込み内容と手順を Yoshida に提示し、明示承認を得る。承認前に production import を実行しない。
5. 書き込み後、`Brand=297`、`BrandAlias=581`、`normalizedAlias` の重複・衝突なし、canonical fields、movement maker flags、FK / constraints を検証する。

data import のみなら、code 変更がない限り deploy は不要。

## Non-goals

Task174 では DB write、seed apply、migration、deploy、push、tag、backup 作成を行わない。既存ファイルは変更しない。production 接続の失敗から DB outage を断定せず、deterministic equivalent plan を literal production script output として扱わない。

Production: pending / no production write.
