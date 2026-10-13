# Task211A — Repair photo capture reliability / quality

Production: future / not started

## Background

B2B実案件E2E（Repair #4）中に、写真撮影まわりで以下を確認した。

- PC案件詳細の保存済み写真一覧に、以前確認できていた解像度表示がない。
- PCカメラ撮影画像の見た目が時計修理記録用途として粗く、細部確認に不安がある。
- スマホQR連携で `QR -> カメラ起動 -> 撮影 -> 登録` を行うと「アップロードに失敗しました」で保存できない。

現行調査では、案件詳細内蔵カメラは実入力解像度をcanvasへ写し JPEG 92% で保存、別の `CameraCaptureDialog` はWebP 92%、スマホQR撮影は `maxWidthOrHeight: 3000` / `maxSizeMB: 1` / WebP圧縮となっている。R2保存APIは受信画像を再圧縮せずそのまま保存する。

## Scope

- スマホQR撮影アップロード失敗の原因を切り分けて修正する。認証/session、upload payload、category/stage、iPhoneブラウザ挙動を確認する。
- 保存済み写真カードに実画像の解像度（例 `3840 x 2160 px`）を表示する。
- PCカメラで実際に取得・保存された解像度を確認できるようにし、低解像度negotiation時の原因を追えるようにする。
- 時計文字盤、傷、ムーブメント部品等の細部を残せるよう、PC/スマホの圧縮・形式・品質設定を再評価する。スマホの1MB固定圧縮は前提にしない。
- 案件詳細内蔵カメラと `CameraCaptureDialog` の重複実装を確認し、保存品質・形式・解像度表示の方針を揃える。
- R2 / RepairPhoto / 公開・顧客共有の既存安全性を壊さない。

## Constraints

- このTaskはB2B専用ではなく、Repair写真基盤の共通改善として扱う。
- 実顧客データを使った破壊的テストは行わない。
- schema変更が必要かは実装前調査で判断し、不要なら画像の `naturalWidth` / `naturalHeight` 等で表示する最小差分を優先する。
- schema / migrationが必要になった場合は高リスク変更として別承認・独立レビューを行う。

## Validation targets

- PC撮影: 入力解像度、保存解像度、保存形式、ファイルサイズを確認できる。
- 保存済み写真: 一覧上で実解像度が確認できる。
- スマホQR撮影: iPhone実機で撮影からRepair写真保存まで成功する。
- 既存の写真追加、拡大表示、削除、工程/部位、顧客共有/事例/SNS設定に回帰がない。
