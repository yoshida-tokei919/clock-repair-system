# AI Task 002: 新規案件ではQRスマホ撮影を無効化する

## 目的

新規案件作成画面では、写真タブのQRスマホ撮影機能を無効化する。

現在、新規案件では `repairId` がまだ確定していない。
その状態でQRスマホ撮影を使うと、`repairId="new"` のような値が `/api/upload` に渡り、サーバー側で `parseInt("new")` が失敗する可能性がある。

そのため、QRスマホ撮影は既存案件でのみ利用可能にする。

## ブランチ

feature/disable-qr-mobile-capture-on-new-repair

## 触ってよい範囲

- `src/components/repairs/RepairEntryForm.tsx`

## 触ってはいけない範囲

- `prisma/schema.prisma`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `src/app/api/upload/route.ts`
- `src/actions/document-actions.ts`
- 保存ロジック
- API routes
- DB schema
- UI全体の大改修

## 前提

- 修理案件写真と部品マスタ写真は別設計として扱う。
- 今回は修理案件写真タブ内のQRスマホ撮影だけを対象にする。
- PC側Webカメラ撮影や通常ファイルアップロードは、今回の対象外。
- 新規案件では `repairId` が未確定のため、QRスマホ撮影は使わせない。
- 既存案件では従来通りQRスマホ撮影を使えるようにする。
- `RepairEntryForm.tsx` は巨大で壊れやすいため、最小差分で対応する。
- 不要なリファクタリングは禁止。

## 実装要件

- 新規案件作成画面では、QRスマホ撮影ボタンを無効化する。
- 既存案件詳細・編集画面では、QRスマホ撮影ボタンを従来通り利用できる。
- 新規案件でQRスマホ撮影を押そうとした場合、ユーザーに以下の趣旨を案内する。

例：

```text
スマホ撮影は案件保存後に利用できます。