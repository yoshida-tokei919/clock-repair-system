# Task 116: Fix PartsMaster duplicate detection to respect grade

## 問題

同じ部品番号でもgradeが異なるPartsMasterを、既存の重複判定が同一レコードとして扱う可能性があった。
このため、例えば純正の既存PartsMasterにFITの登録を行うと、既存レコードが更新される危険があった。

## 原因

`createOrUpdatePartsMaster`とTask 114/115のpreview/checkは、強一致・既存判定の条件にgradeを含めていなかった。

## 修正箇所

- `src/lib/parts-master.ts`
  - 既存PartsMaster検出でgradeを比較するようにした。
  - `gradeId`を優先して解決し、必要な場合だけ既存PartGradeMasterの完全一致の名称から解決するようにした。
- `src/lib/parts-master-growth-preview.ts`
  - 内装・外装ともstrong matchにgradeを追加した。
  - gradeが異なる既存候補の利用を409で止め、既存PartsMasterのgradeを上書きしないようにした。
- `src/components/parts/PartsSearchPanel.tsx`
  - 選択済みgradeをWeb検索パネルのpreview/check payloadへ渡すようにした。
- `src/components/parts/PartsWebSearchPanel.tsx`
  - 対象gradeが変わったとき、前のpreview/commit状態を残さないようにした。
- `scripts/seed-part-standard-masters.ts`
  - PartGradeMasterのseed候補へ`中古`を追加した。

## 修正後の比較ルール

- `gradeId`が双方にある場合は`gradeId`の一致を使う。
- `gradeId`が不足する既存データとの比較だけ、`grade`文字列のtrim後の完全一致を使う。
- 記号除去、曖昧一致、メーカー別の独自正規化は追加していない。
- partRefはTask 113のルールどおり、前後空白のみを除去して比較する。

内装のstrong match:

- `partType = interior`
- `movementMakerId`
- `movementCaliberId`
- `partRef`
- `grade`

外装のstrong match:

- `partType = exterior`
- `brandId`
- `partRef`
- `grade`

同一partRefでも純正、FIT、合わせ、中古は別PartsMasterとして扱う。中古はMVPではgradeであり、部品名へ付加しない。

## 確認内容

- 同一gradeの外装候補はstrong matchになることを軽量テストで確認した。
- 同一partRefで純正とFITが異なる場合、strong matchにならずsimilar candidateになることを軽量テストで確認した。
- gradeが異なる既存PartsMasterを明示選択した場合、409で利用を止めることを軽量テストで確認した。
- Task 116の実画面確認後、create側の既存検索が`partType`だけで候補を絞っており、`category: internal/external`で保存済みの既存PartsMasterを取り逃す経路を修正した。
- create側の内装・外装判定をpreviewと揃え、内装にbrand、外装にwatchRefを追加条件として課さないようにした。
- 同一grade・同一strong matchの内装と外装で、growth createが409となりcreateが呼ばれないことを軽量テストで確認した。
- 同一partRefでgradeが異なる内装は、createOrUpdatePartsMasterが新規作成経路へ進むことを軽量テストで確認した。
- Prisma schema、migration、既存DBデータは変更していない。

## 次工程への注意

- 既に誤って上書きされた可能性があるローカルデータは自動修復しない。必要なら別Taskで確認・修復方針を設計する。
- 帳票・見積表示上のgrade表示は今回の対象外であり、別Taskで表示要件を整理する。
- `中古`を既存DBへ追加する場合は、既存seed運用に従い明示的に実行する。今回の実装ではseed scriptを実行していない。
