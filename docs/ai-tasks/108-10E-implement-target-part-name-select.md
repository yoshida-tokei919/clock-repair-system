# Task 108-10E: 構造化作業入力UIの対象部品をPartNameMaster選択にする

## 目的

108-10B/108-10Dで追加したRepairEntryForm上の構造化作業入力UIについて、技術料行の「対象部品」を自由入力から `PartNameMaster` の選択に変更する。

これにより、作業対象としての部品名を `PartsMaster` の実部品在庫・価格レコードではなく、標準部品名マスタとして扱えるようにする。

## 実装範囲

実装したこと:

- 技術料行の構造化作業入力UI内だけで、「対象部品」をselectに変更
- `PartNameMaster` から内装系の有効な部品名候補を取得するserver actionを追加
- 選択時に `targetPartNameId` と `targetPartNameSnapshot` をLineItemへ渡す
- `targetPartNameSnapshot` は選択肢の表示名を保存する

実装しないこと:

- 交換部品行への構造化作業入力追加
- `PartsMaster.partsMasterId` との紐づけ
- `PricingRule` 検索条件の変更
- `EstimateItem` 保存処理の変更
- schema / migration / seed / DB変更
- 帳票 / PDF / LINE / 共有ページ / PublicCase 表示変更
- `relatedWorkLineItemId` の実装
- `RepairWorkName` seed
- `RepairWorkDetailMaster`

## 対象部品selectの方針

短期実装として、対象部品候補は `PartNameMaster.partType` または紐づく `PartCategoryMaster.partType` が内装系のものに限定する。

主対象は以下:

```txt
part_internal
```

既存データの揺れを考慮し、取得条件では補助的に以下も許容する。

```txt
internal
interior
```

ただし、今回のUIは「技術料の作業対象」を選ぶための補助欄であり、交換部品行の実部品選択や発注用の `PartsMaster` 検索とは別物として扱う。

## 保存方針

技術料行を明細に追加するときだけ、任意項目として以下をLineItemへ渡す。

```txt
targetPartNameId: PartNameMaster.id
targetPartNameSnapshot: PartNameMaster.displayJa || PartNameMaster.nameJa
```

部品行の `partsMasterId` には使わない。

`EstimateItem` 保存には使わず、帳票表示も従来通りにする。

## UIイメージ

```txt
[＋ 詳細な作業分類を入力する]

展開後:
  作業カテゴリ: [ゼンマイ周り ▼]
  対象部品:     [ゼンマイ ▼]
  処置:         [交換 ▼]
  detail:       [ブッシュ / ピン / 穴]
```

## 検証結果

以下を実行した。

```txt
npx prisma validate: OK
npx prisma generate: OK
npx tsc --noEmit --pretty false --incremental false: OK
```

補足:

- `npx prisma generate` はサンドボックス内ではPrisma engine確認のネットワークアクセスで失敗したため、許可付きで再実行して成功。
- `npm run dev -- -p 3001` はサンドボックス内では `spawn EPERM`、許可付きでは `EADDRINUSE`。
- `npm run dev -- -p 3002` は短時間起動確認でタイムアウトしたが、直後に3002番ポートの待受は残っていないことを確認。
