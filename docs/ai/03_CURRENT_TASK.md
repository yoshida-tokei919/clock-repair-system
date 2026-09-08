# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書です。過去Task履歴は残さず、現在有効な状態だけを書きます。

## 現在Task

Task156: Repair写真を Cloudflare R2 private storage へ正式移行する。

## Task境界

- RepairPhoto の新規アップロードを private R2 object と opaque な `storageKey` へ移行する。
- private 写真は権限確認済みサーバー経由の短命 signed URL で表示する。
- 公開事例に選択した写真は R2 内で PublicCase 用 object に copy し、公開画像 route から表示する。
- 既存 RepairPhoto の Base64 データは移行・削除しない。
- production DB、Railway、production R2 は変更しない。

## 対象外

- PDF、Document、既存 Supabase Storage の対象外データ
- 既存 RepairPhoto の一括移行・削除
- production 環境の設定・デプロイ
