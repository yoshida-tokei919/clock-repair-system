# Task 115: Complete PartsMaster growth flow from repair line item

## 問題

Task 114では、Web検索中に判明した部品番号からPartsMaster候補をpreview/checkするところまで実装した。
ただし、既存PartsMasterを使う確定操作、新規PartsMaster作成、編集中Repair明細への`partsMasterId`反映は未実装だった。

## 実装内容

- `POST /api/parts/growth`を追加した。
- 既存PartsMaster候補をユーザーが選択した場合、そのPartsMasterを明細へ反映できるようにした。
- 新規PartsMaster候補をユーザーが確認した場合、新規作成して明細へ反映できるようにした。
- 反映はRepairLineItem DBを直接更新せず、`RepairEntryForm -> PartsSearchPanel -> PartsWebSearchPanel`の既存`onSelect`経路で編集中`LineItem.partsMasterId`へ戻す。
- その後の永続化は既存のRepair保存フローに任せる。

## API

`POST /api/parts/growth`

- `action: "use-existing"`の場合、指定された`partsMasterId`を取得し、入力された`partRefs`を既存PartsMasterへmergeする。
- `action: "create"`の場合、preview/checkを再実行し、強一致があれば409で作成を止める。
- 新規作成は既存`createOrUpdatePartsMaster`を通す。

## 比較・重複ルール

内装の強一致は以下を使う。

- `partType = interior`
- `movementMakerId`
- `movementCaliberId`
- `partRef`

外装の強一致は以下を使う。

- `partType = exterior`
- `brandId`
- `partRef`

Task 113のpartRef比較ルールを維持し、前後空白以外の記号除去は行わない。

## contextルール

内装PartsMasterの候補作成ではmovement軸を使う。

- `movementMakerId`
- `movementCaliberId`
- `baseMovementMakerId`
- `baseMovementCaliberId`

外装PartsMasterの候補作成ではwatch軸を使う。

- `brandId`
- `modelId`
- `watchRef`

内装候補へ`watchRef`/`model`を保存する変更は行っていない。

## UI

`PartsWebSearchPanel`に以下を追加した。

- 強一致/類似候補の「このPartsMasterを使用」
- 新規候補の「新規PartsMasterを作成して反映」
- 確定前の`window.confirm`
- commit APIのエラー表示

部品番号保存ボタンは、従来どおり既存`partsMasterId`がある場合だけ有効。

## Repair明細への反映

Web検索パネルで確定したPartsMasterは、通常の部品検索結果と同じ形へ変換し、`PartsSearchPanel.onSelect`へ返す。
`RepairEntryForm`側では既存の`buildPartLineItem`と`finalizePartLineItem`を通して対象行だけ更新する。

`buildPartLineItem`の`category`は`partType`に従って以下へ揃える。

- `interior` -> `part_internal`
- `exterior` -> `part_external`

## 今回変更しないもの

- Prisma schema
- migration
- Web検索query生成
- site profile
- localStorage schema
- PROVISIONAL / VERIFIED
- source/evidence管理
- 説明書import/export
- RepairLineItem DBの即時更新
- 注文自動化

## 次工程への注意

- source/evidenceやPROVISIONAL/VERIFIEDを扱う場合はschema設計が必要。
- 説明書import/exportやbulk registerは、今回追加したpreview/checkとcommitの分離を維持する。
- 実画面では、既存候補利用と新規作成の両方で`LineItem.partsMasterId`が入り、通常のRepair保存後に永続化されることを確認する。
