# AI Task 019: 右部品パネル候補一覧に下代を表示

## 目的

右部品パネルのPartsMaster候補一覧で、候補比較に必要な下代 / 仕入金額を確認できるようにする。

## 変更ファイル

- `src/components/parts/PartsSearchPanel.tsx`
- `docs/ai-tasks/019-show-cost-in-parts-panel-candidates.md`

## 下代として表示したフィールド

既存APIレスポンスに含まれる `latestCostYen` を「仕入」として表示した。

`PartsSearchPanel` では既に候補選択時に `latestCostYen` を `cost` / `latestCostYen` として渡しているため、APIや保存処理は変更していない。

## API変更の有無

なし。

## 型チェック結果

`npx.cmd tsc --noEmit` 通過。

## 画面確認してほしい操作

1. `/repairs/new` または既存案件の編集モードで右部品パネルを開く。
2. PartsMaster候補一覧に「仕入」列が表示されることを確認する。
3. 上代・仕入・在庫・グレードを同時に比較できることを確認する。
4. `/parts` standalone の候補一覧でも表示が崩れていないことを確認する。
