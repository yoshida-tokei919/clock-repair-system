# Task211D — Repair手入力内装部品の区分整合

Status: local implementation complete / Katari independent review complete  
Production: pending

## E2E blocker

B2B実案件K-002の保存時、手入力の内装交換部品が `partType=interior` と `category=part_external` を併せ持ち、サーバーの `getRepairPartType` が区分矛盾として拒否した。交換部品の入力欄は共通で `part_external` を選択値に使い、部品マスタ候補が見つからない手入力経路だけ、その値を新規行へそのまま渡していた。

## 変更範囲

- 新規交換部品行の区分を、選択した `PartInputType` から `part_internal` / `interior` または `part_external` / `exterior` として組み立てる。
- 技術料の区分、PartsMaster候補を選択した経路、サーバー側の矛盾検証は維持する。
- schema、migration、既存保存データ、マスタ、価格には変更なし。

## Local verification

- `npx tsx --test src/lib/repair-entry-item-classification.test.ts src/lib/parts-master-compatibility.test.ts`: 29 passed / 0 failed。手入力の内装・外装を実際の `getRepairPartType` に通し、矛盾行の拒否と技術料区分の維持を確認。
- `npx tsc --noEmit --incremental false`: PASS。
- `git diff --check`: PASS（改行形式のwarningのみ）。

カタリ独立差分レビュー: 新規行作成に分類関数が接続され、保存payloadでもcategory / partTypeが保持されること、技術料・マスタ選択経路・サーバー検証を維持することを確認。blocking findingなし。

Production deploy・認証済み実案件の再保存は未実施。ユーザー承認後にmain push / Railway deploy / production smokeを行う。本番DBへの直接変更は不要。
既に開いている画面内の未保存の矛盾行は自動補正しないため、反映後に内容を控えて再読込し、該当部品行を正しい区分で追加し直す必要がある。
