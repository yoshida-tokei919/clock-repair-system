# CURRENT TASK

このファイルは現在進行中のTask状態を管理する正本文書です。過去Task履歴は残さず、現在有効な状態だけを書きます。

## 現在Task

Phase 2 部品Web検索: Web検索中に判明した部品番号を既存PartsMasterへ追記し、保存直後にその部品番号を使って検索語を再生成する実装完了。

## 今回完了した内容

- `RepairEntryForm -> PartsSearchPanel -> PartsWebSearchPanel` に `partsMasterId` を接続
- `PATCH /api/parts/[id]/search-info` を追加
- 更新対象を `PartsMaster.partRefs` のみに限定
- 既存 `partRefs` を維持した merge 追記を実装
- 重複番号を追加せず `skippedPartRefs` として返す処理を実装
- `PartsWebSearchPanel` に部品番号保存UIを追加
- 保存成功後、追加した部品番号を active partRef として検索contextに即時反映
- `partsMasterId` がない場合は保存UIのみ無効化し、Web検索自体は継続可能にした
- RepairLineItem snapshot は更新しない方針を維持

## 実装ファイル

- `src/lib/parts-master-search-info.ts`
- `src/app/api/parts/[id]/search-info/route.ts`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/repairs/RepairEntryForm.tsx`
- `docs/ai-tasks/110-4-implement-part-ref-save-from-web-search.md`
- `docs/ai/03_CURRENT_TASK.md`

## 実装しなかったこと

- Prisma schema変更
- migration作成
- PartsMaster新規作成
- RepairLineItem snapshot自動更新
- `nameEn` / `cousinsNumber` 保存
- manufacturer original name保存
- search alias DB保存
- sourceType / PROVISIONAL / VERIFIED 保存
- 既存 `PUT /api/parts/[id]` の仕様変更
- `docs/ai/02_PRODUCT_ROADMAP.md` 更新

## 検証済み

- `prisma/schema.prisma` の `PartsMaster.partRefs` / `RepairLineItem.partsMasterId` 確認
- `src/lib/parts-master.ts` の既存 normalize / split / PUT 更新経路確認
- `src/app/api/parts/[id]/route.ts` の既存 PUT を流用しないことを確認
- `npx tsc --noEmit --pretty false --incremental false`
- `npx tsx -e` による merge / fake db 更新確認
- `npm run build`
- `git diff --check`

## 次Task候補

Repair案件からPartsMasterを育てるフローのpreview/checkを次工程として扱う。

方針:

- PartsMaster未登録の交換部品でも、Web検索で判明した `partRef` から登録候補を確認できるようにする
- 登録前に既存PartsMasterの `partRefs` 重複を確認し、既存候補または新規登録候補を表示する
- 内装は `movementMaker + movementCaliber + partRef`、外装は `brand + partRef` を強い重複候補軸にする
- `partRef` 比較は前後空白の除去に留め、ハイフン・ドット・スラッシュを無条件に削除して同一扱いしない
- 解説書取込はアプリ内AI APIを使わず、ChatGPT/Codex連携用のexport/import導線として検討する
- PROVISIONAL / VERIFIED / source/evidence正式schemaは必要性が確認できてから後続Taskで扱う
- 既存候補の利用確定、新規PartsMaster作成、RepairLineItem.partsMasterId反映は後続Taskで扱う

## 注意

PartsMaster と PartNameMaster は別マスタとして扱う。今回更新したのは既存実部品レコードである PartsMaster の `partRefs` のみ。
