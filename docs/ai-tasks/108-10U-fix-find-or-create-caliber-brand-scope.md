# Task 108-10U: findOrCreateCaliber（Cal検索・作成処理）をbrandId込みで安全化

## 目的

108-10Tで Cal / Base Cal の候補をメーカー別に絞り込んだため、自由入力CalやCalマスタ作成時に使われる `findOrCreateCaliber（Cal検索・作成処理）` も、メーカーを考慮して既存Calを検索するようにした。

このTaskでは schema / seed / DB / UI / 保存payload は変更していない。

## 前提commit

```txt
433f540 feat: filter cal candidates by selected maker
004a86e docs: design cal candidate drilldown
8137a7f feat: display cal and base cal as grouped fields
```

## 変更ファイル

```txt
src/lib/master-normalize.ts
docs/ai-tasks/108-10U-fix-find-or-create-caliber-brand-scope.md
```

## findOrCreateCaliber（Cal検索・作成処理）の現状

場所:

```txt
src/lib/master-normalize.ts
```

関数:

```ts
findOrCreateCaliber(db, rawName, brandId?)
```

呼び出し元:

```txt
src/actions/master-actions.ts
src/lib/parts-master.ts
src/app/api/master-data/route.ts
src/app/api/repairs/route.ts
src/app/api/repairs/[id]/route.ts
```

Repair保存APIでは以下の対応で呼ばれている。

```txt
watch.caliber
→ findOrCreateCaliber(..., brand.id)
→ Watch.caliberId

watch.movementCaliber
→ findOrCreateCaliber(..., movementMakerId)
→ Repair.movementCaliberId

watch.baseMovementCaliber
→ findOrCreateCaliber(..., baseMovementMakerId)
→ Repair.baseMovementCaliberId
```

## Caliber（Calマスタ）の一意性確認

`prisma/schema.prisma` の `Caliber` には `brandId` がある。

```prisma
model Caliber {
  id      Int  @id @default(autoincrement())
  brandId Int?
  name    String
}
```

確認結果:

```txt
Caliber.name は unique ではない
Caliber に @@unique([brandId, name]) はない
brandId + name の複合uniqueはない
brandId付きで同名Calを複数作ることはschema上可能
```

そのため、このTaskでは schema変更や upsert は使わず、`brandId（ブランドID / メーカーID）` と正規化Cal名で絞る短期実装にした。

## 変更前のリスク

変更前は、`findOrCreateCaliber()` が全Caliberを取得し、正規化Cal名だけで一致判定していた。

```txt
name（Cal名）だけで検索
→ メーカー違いの同名Calを拾う可能性がある
```

例:

```txt
ROLEX 1570 を保存したい
→ 別メーカーの 1570 を返す可能性がある
```

また、108-10U初回修正では、同名の `brandId = null` Caliber がある場合に、それを指定 `brandId` へ更新して返す挙動があった。

これは、既存案件が参照しているメーカー未設定Calの意味をあとから変えてしまう可能性があるため危険と判断した。

## 変更後の仕様

`brandId（ブランドID / メーカーID）` がある場合、検索対象を指定 `brandId` のCaliberだけに限定した。

```txt
brandId が指定メーカーと一致するCaliber
```

検索順:

```txt
1. 指定 brandId + 正規化Cal名 が一致するCaliberを返す
2. 見つからなければ、指定brandId付きで新規作成する
```

これにより、メーカー違いの既存Caliberは拾わない。

また、`brandId = null（メーカー未設定）` の既存Caliberは、指定 `brandId` へ勝手に更新しない。

禁止した挙動:

```txt
brandId = null のCaliberを見つける
→ 指定brandIdへ更新する
→ それを返す
```

理由:

```txt
brandId = null のCaliberが既存案件から参照されていた場合、
あとから ROLEX / ETA などへ書き換えると、既存案件の意味まで変わってしまうため。
```

## brandId（ブランドID / メーカーID）がない場合の扱い

`brandId` がない場合は、影響範囲を広げないため既存互換を残した。

```txt
brandId がない
→ brandId = null のCaliberだけを検索対象にする
→ 見つからなければ brandId = null で新規作成する
```

理想的には、メーカー未選択のまま新規Calを登録する導線では、UI側でメーカー選択を促すべき。

ただし、このTaskで `brandId` なしの作成を禁止すると、既存のマスタ画面・部品マスタ・手入力導線への影響が大きいため、今回は互換維持を優先した。

## 呼び出し側の変更有無

呼び出し側は変更していない。

理由:

```txt
Repair新規作成API / 更新APIは、すでに movementMakerId / baseMovementMakerId を findOrCreateCaliber へ渡している。
master-actions.ts の upsertCaliber も brandId を受け取れる。
```

今回の安全化は `findOrCreateCaliber()` 内部に閉じた。

## 変更していないもの

以下は変更していない。

```txt
schema
migration
seed
DB構造
RepairEntryFormのUIレイアウト
Cal / Base Cal の候補ドリルダウンUI
保存payload
Repair保存API
PartsMaster検索
getPartsMatched
PartsSearchPanel
PricingRule
帳票
PDF
LINE
共有ページ
PublicCase
108-10Pの対象部品候補絞り込み
```

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
# success

npx tsc --noEmit --pretty false --incremental false
# success
```

## 未確認点

画面からの自由入力Cal登録は未確認。

未確認の論点:

```txt
brandId null の Caliber がローカルDBにどれだけ残っているか
同名Calが複数メーカーに存在する実データがあるか
```

## 次Task候補

```txt
Task 108-10V:
Caliber.brandId 未設定データ、同名Cal、主要メーカー別Cal登録状況をローカルDBで確認する。
```

```txt
Task 108-10W:
メーカー未選択でCalを自由入力した場合、UI側でメーカー選択を促す仕様を検討する。
```
