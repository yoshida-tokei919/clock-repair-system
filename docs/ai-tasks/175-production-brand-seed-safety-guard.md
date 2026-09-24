# Task175: production canonical Brand seed safety guard

## Purpose and guard contract

`scripts/seed-canonical-brands.ts` の production apply 誤実行を防ぐコードのみの変更。既定の dry-run は従来どおり確認不要で、canonical alias を検証し、既存 Brand / BrandAlias を読み取って計画を表示する。`isMovementMaker=true` を false に戻さない既存処理も変更していない。

`--apply` の場合、まず `@prisma/client` モジュールを読み込み、既存の Prisma / `.env` 設定を反映する。その後、有効な `process.env.DATABASE_URL` を検証し、guard を通過してから PrismaClient を生成して DB query を行う。URL が未設定、不正、または PostgreSQL URL 以外なら失敗する。hostname が `localhost`、`127.0.0.1`、`::1`（URL parser の値は `[::1]`）ならローカル apply を従来どおり許可する。その他の hostname では以下の両方が完全一致で必要。重複した CLI confirmation も拒否する。`NODE_ENV` は判定に使わず、代替 bypass flag はない。

- CLI: `--production-confirm=TASK175_CANONICAL_BRAND_IMPORT`
- environment: `PRODUCTION_CANONICAL_BRAND_IMPORT_CONFIRM=TASK175_CANONICAL_BRAND_IMPORT`

## Verification

- `tsc --noEmit --incremental false`: 成功。
- 偽の非ローカル URL `postgresql://example.invalid:5432/clock_repair` で、`--apply` の confirmation なし、CLI のみ、environment のみをそれぞれ実行。すべて終了コード 1、guard message を確認し、Prisma 接続エラーなし。両方を指定する非ローカル apply は実行していない。
- 検証関数を単独で実行し、真の `DATABASE_URL` 未設定、parse 不能 URL、非対応 `mysql:` URL の拒否と、3 種類のローカル hostname の許可を確認。DB 接続なし。repo `.env` がある状態で、未設定 URL の script 全体テストは行っていない。
- DB 接続なしの module import 確認で、`@prisma/client` の dynamic import が repo `.env` の `DATABASE_URL` を読み込むことを確認。ローカル apply 自体は実行していない。
- dry-run に apply guard がかからないことをコードレビューで確認。さらにChatGPT独立レビューでlocal dry-runを実行し、`canonicalBrandCount=297`、`CREATE=0`、`UPDATE=0`、`aliasCreate=0`、`SKIP=581`、`conflicts=0`、終了コード0を確認した。書き込みなし。
- ChatGPT独立レビューでも偽の非ローカルURLを使用し、confirmationなし / CLIのみ / environmentのみ / CLI confirmation重複の4ケースがすべてDB query前に拒否されることを確認した。
- `git diff --check`: 成功。

最初の未設定 URL テストでは、`@prisma/client` import がローカル `.env` の `DATABASE_URL` を補い、意図せずローカル apply transaction 経路に入った。表示された計画は Brand CREATE/UPDATE と aliasCreate がすべて 0 で、行を変更する書き込みはなかった。この事象を受け、Prisma モジュールの読み込みと Client 生成を分離した。ローカル `.env` apply を維持するため、モジュール読み込みは guard 前、Client 生成と query は guard 後とした。production write は行っていない。

## Next production Task

実行直前に production の Brand / BrandAlias 件数を再取得し、新しい production backup を作成する。独立レビュー結果と実行計画を確認し、吉田の明示承認を得てから guarded apply を行い、Brand / BrandAlias 件数、canonical fields、alias 重複・衝突、movement maker flags、FK / constraints を事後検証する。

Production: pending。コードのみの安全対策で、未 deploy・production DB write なし。
