# 110-5 部品Web検索パネルの初期partType修正

## 目的

旧「検索サイトを選択」ダイアログから新しい部品パネルを開いたときに、内装部品として入力した交換部品が外装として扱われる問題を修正する。

## runtime追跡結果

対象の入力状態は以下の構造だった。

- 種別: `addItemCategory = "part_external"`
- 内外装: `selectedPartInputType = "part_internal"`
- カテゴリ: `selectedPartCategoryKey = "mainspring_barrel"`
- 部品: `selectedPartNameKey` はゼンマイ相当

`addItemCategory = "part_external"` は「交換部品」行を表すための値であり、内外装の外装を意味する値ではない。

しかし、明細追加時に `selectedPartInputType` が `LineItem.partType` へ転記されていなかった。そのためPartsMaster未選択の部品行では、追加直後の `LineItem` が以下のようになっていた。

```ts
{
  category: "part_external",
  partType: undefined,
  name: "ゼンマイ"
}
```

この状態で虫眼鏡を押すと、`partSearchRowIdx` と `partsPanelRowIdx` は同じ行を指していても、対象行に内装を示す正式fieldが残っていないため、旧ダイアログおよび新部品パネルが外装として扱っていた。

## 原因

内外装情報は入力UIでは `selectedPartInputType` に存在していたが、明細行のruntime objectである `LineItem.partType` に保存されていなかったこと。

110-5初回修正では `category: internal` / `part_internal` を変換対象に追加したが、実際の内装交換部品行は `category: part_external` のまま、`partType` 欠落だったため効果がなかった。

## 修正内容

- 明細追加時、部品行の場合だけ `selectedPartInputType` を `LineItem.partType` へ保存する
- `part_internal` は `interior` へ変換する
- `part_external` は `exterior` へ変換する
- `category` は交換部品行を表す既存値として維持する
- `PartsSearchPanel` は `initialPartType` の変更時に内部 `partType` stateへ同期する

## partType経路

1. 部品追加UIで `selectedPartInputType` を選択する
2. 明細追加時に `LineItem.partType` へ `interior` / `exterior` として保存する
3. 虫眼鏡押下で `partSearchRowIdx` を保持する
4. 旧ダイアログの「部品パネル」押下で `partsPanelRowIdx = partSearchRowIdx` にする
5. `activePartsPanelLineItem = lineItems[partsPanelRowIdx]`
6. `derivePartsSearchPartTypeFromLineItem(activePartsPanelLineItem)` が `LineItem.partType` を読む
7. `PartsSearchPanel.initialPartType` へ渡す
8. `PartsSearchPanel` 内部の `partType` stateへ同期する
9. `PartsWebSearchPanel.partType` へ渡す

## 変更しないこと

- 検索語生成ルール
- alias/fallback
- site profile
- temporary profile
- localStorage仕様
- 部品番号保存API
- PartsMaster schema
- migration
- PROVISIONAL / VERIFIED
- PublicCase
