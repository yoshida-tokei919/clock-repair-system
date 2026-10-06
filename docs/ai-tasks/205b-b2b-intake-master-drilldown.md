# Task205B — B2B一括受付の時計マスター段階入力

## Scope

- Task205Aの `/repairs/b2b-intake` に、ブランド → モデル → Ref・Cal の候補検索を追加する。
- ブランドは既存の時計ブランドから選択する。モデル・Ref・Calは既存候補の選択と自由入力の両方を許す。
- モデル候補は選択ブランドのModel、Ref候補は選択モデルのWatchReferenceを使用する。Cal候補は既存 `getCalibersForModel` と同じく、選択モデルのWatchReference、選択ブランド・モデルのPartsMasterとPricingRuleに紐づくCaliber IDを重複排除して名前順に表示する。該当IDがなければ選択ブランドの全Caliberを名前順に候補とする。
- RefにCaliberが紐づく場合はCalを補完する。後からCalを手動修正できる。
- ブランド変更ではモデル・Ref・Calを、モデル変更ではRef・Calを、Ref変更ではCalを消してから新しい候補に応じて補完する。
- 候補はブランドIDおよびブランドID・モデルIDの組でフォーム内に共有し、最大30行でも同じマスターの重複取得を避ける。候補表示は各行の現在のブランド・モデルから計算するため、旧選択の遅延応答は表示されない。取得失敗時は同じ選択へ戻して再試行できる。
- 候補取得は管理者認証を確認し、必要な時計マスター項目だけを返す。

## Preserved behavior

- Task205AのPOST payload (`brandId`, `model`, `ref`, `caliber`)、find-or-create、1トランザクション、連番採番、返送先snapshot、通信結果不明時の再送防止を維持する。
- `watch.caliber`のみが対象。RepairのmovementMaker / movementCaliber / baseMovementCaliberは対象外。
- Cal候補は既存 `getCalibersForModel` の3種類の根拠とfallbackに合わせる。PartsMasterは実部品・在庫、PricingRuleは価格ルールとしての既存データを読むだけで、マスタや価格は変更しない。
- B2C、Shipment、PhysicalTag、StorageLocation、LINE、PDF、schema / migration / RLS / GRANT、production DBは変更しない。

## Validation

- Task205A regression tests 6/6 + Task205B drilldown tests 4/4 = 10/10 PASS.
- `node node_modules/typescript/bin/tsc --noEmit`: PASS.
- `node node_modules/next/dist/bin/next build`: PASS (Next.js 15.5.27, static pages 57/57, build traces collected).
- `git diff --check`: PASS.
- Independent review: no blocking findings.

Production: pending。
