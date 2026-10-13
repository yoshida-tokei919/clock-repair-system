# Task205E — B2B intake document / image AI assist

## Status

Future task. B2B E2E blockerではないため、実案件E2Eは現行の手入力で継続する。

## Goal

B2B受付時に、時計へ同封された依頼書・メモ等を任意で取り込み、既存カメラ画像も含めてAIが時計情報・依頼情報の入力候補を作る。AI結果は直接確定せず、人間が確認・修正してから案件化する。

## Input sources

- 既存の時計撮影用カメラ（Webカメラとして認識済み、アプリ内撮影導線を再利用）
- ScanSnap iX1300
- 依頼書がない取引先は従来どおり手入力でき、この機能を必須にしない

## Target flow

1. B2B受付で取引先を選択する。
2. 任意で「依頼書・資料から入力候補を作成」を選ぶ。
3. 既存カメラ撮影またはScanSnap iX1300で資料を取り込む。
4. 原本資料を受付/Repairから後で参照できる形で保存する。
5. OpenClaw経由のChatGPT Plus枠で資料を解析する。OpenAI APIその他の従量課金AI APIは使用しない。
6. brand / model / Ref / serial / Cal / movement maker / base Cal / 取引先管理番号 / 依頼内容 / 症状等、読み取れた項目だけ候補表示する。
7. 人間が候補を確認・修正し、「この内容で案件化」を明示操作する。
8. Watch + Repair作成後、現物写真や実物確認で不足情報を補完・訂正する。

## Safety / UX rules

- AI候補を自動でDB正本へ確定しない。
- 読み取れない項目は空欄でよい。推測で埋めない。
- 既存マスタの正本性を壊さず、Task205B/Cのdrill-down・自由入力候補を再利用する。
- 依頼書なしでも受付できる。
- 複数時計・複数ページの資料と対象Repairの対応を人間が確認できるようにする。
- OpenAI APIキーを追加・参照しない。Plus枠が利用不能ならAI候補生成を停止し、手入力を維持する。

## ScanSnap integration direction

実装前にiX1300の現行SDK/driver環境を実機で再確認する。第一候補は、受付画面の「スキャン」操作から直接取り込みできる方式。フォルダ監視方式はfallback候補とする。

## Production

Not implemented. Future task only.
