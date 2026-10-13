# Task211A — Repair photo capture reliability / quality

Production: future / not started

## Background

B2B実案件E2E（Repair #4 / #5）中に、写真撮影まわりで以下を確認した。

- PC案件詳細の撮影ダイアログには、入力解像度・映像解像度・表示サイズの診断表示が現存しており、この表示自体の追加修正は不要。
- 2026-10-13実機確認では、4K対応済みの既存撮影機材にもかかわらず `入力: 1920 x 1080 / 映像: 1920 x 1080 / 30fps` で取得され、時計修理記録用途として画質が粗い。
- 過去Git履歴では、一時期 `maxSizeMB: 1` / 最大3000px / WebP変換や、別カメラ経路で最大2560px / WebP 80% の容量削減を導入していたが、後続の `de09ae1 Preserve pre-recovery camera changes` で1MB圧縮・2560px上限を外し、品質92%・4K要求へ戻している。
- 現行案件詳細内蔵カメラも `3840 x 2160` をideal指定し、実入力解像度をcanvasへ写してJPEG 92%で保存するため、今回の1920 x 1080は保存圧縮より前段のcamera negotiation / device selectionの問題を優先して調査する。
- スマホQR連携で `QR -> カメラ起動 -> 撮影 -> 登録` を行うと「アップロードに失敗しました」で保存できない。

R2保存APIは受信画像を再圧縮せず、そのまま保存する。

## Scope

- PCカメラが以前4K取得できていた環境で現在1920 x 1080へ退行している原因を特定し、可能な限り4K取得へ復旧する。
- 使用中video inputのdevice label / deviceIdを確認可能にし、複数映像入力がある場合に意図した撮影機材を選択・固定できるようにする。
- `MediaStreamTrack.getCapabilities()` 等で実機の対応width / height / frameRateを確認し、4K capabilityがある場合は選択デバイスへ3840 x 2160を明示要求して実取得値を検証する。
- 4K入力取得後、canvas保存画像も元解像度を維持し、不必要な1MB制限・2560px上限等を再導入しない。
- JPEG / WebPの品質設定は、文字盤、傷、刻印、ムーブメント部品等の細部確認を優先しつつ、ファイル容量とのバランスを実画像で評価する。
- 撮影ダイアログの現行解像度診断表示は維持する。保存済み一覧への新たな解像度常時表示は今回の必須要件にしない。
- スマホQR撮影アップロード失敗の原因を切り分けて修正する。認証/session、upload payload、category/stage、iPhoneブラウザ挙動を確認する。
- 案件詳細内蔵カメラと `CameraCaptureDialog` の重複実装を確認し、device selection、保存品質、形式、診断表示の方針を揃える。
- R2 / RepairPhoto / 公開・顧客共有の既存安全性を壊さない。

## Constraints

- このTaskはB2B専用ではなく、Repair写真基盤の共通改善として扱う。
- 「圧縮が原因」と決め打ちせず、入力streamの実解像度 -> canvas -> encoded blob -> R2保存の各段階を測定して原因を分離する。
- 以前4K取得できた実績を前提に、機材能力不足とは決め打ちしない。
- 実顧客データを使った破壊的テストは行わない。
- schema変更は原則不要の想定。必要になった場合は高リスク変更として別承認・独立レビューを行う。

## Validation targets

- PC撮影: 対象カメラのcapabilities、選択device、入力解像度、映像解像度、保存解像度、保存形式、ファイルサイズを確認できる。
- 4K対応機材で3840 x 2160取得が可能なら、実入力・保存画像とも4Kであることを実機確認する。
- 4K取得不可の場合は、ブラウザ / driver / capture board / device modeのどこで1920 x 1080へ制限されているかを特定して記録する。
- スマホQR撮影: iPhone実機で撮影からRepair写真保存まで成功する。
- 既存の写真追加、拡大表示、削除、工程/部位、顧客共有/事例/SNS設定に回帰がない。
