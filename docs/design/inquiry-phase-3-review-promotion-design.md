# Inquiry Phase 3: 確認・昇格設計

## 位置づけ

Phase 2で保存した `InquiryAiAnalysis` / `InquiryAiWatch` / `InquiryAiCandidate` は、AIによる暫定分析である。
Phase 3では、問い合わせ単位で正式Watch / Repairを直ちに作らず、確認済みの時計単位でのみ昇格できるようにする。

本ドキュメントは P3-0 の設計判断であり、schema / migration / code / production DBの変更を許可しない。
PartsMaster再設計はP3-5以降の別Taskとし、Phase 3前半にそのschema変更を混在させない。

## 1. 昇格前の正本

`InquiryWatch` は正式Watch / Repairの前段となる確認用レコードである。
一つのInquiryは複数のInquiryWatchを持てる。

- AI候補、手入力、ユーザー確認の結果を正式masterとは独立して保持する。
- AI候補は初期値・根拠・確信度として表示するが、正式masterの値ではない。
- ユーザーが確定した値は、後続のAI再解析で上書きしない。
- `InquiryMessage` と `InquiryFile` は引き続き不変の入力記録として扱う。

Phase 2の `InquiryAiWatch` はAI分析に属する不変のスナップショットであり、Phase 3の `InquiryWatch` を置き換えたり拡張したりしない。P3-1では新しい確認用モデルとして `InquiryWatch` を追加し、必要に応じて元の `InquiryAiWatch` を参照する。AI分析の保存構造は変更しない。

## 2. masterの扱い

AIの未確定文字列から、Brand / Model / Caliber / WatchReference等の正式masterを自動作成・更新しない。

昇格には確定済みのmaster IDを用いる。未登録の値は、Inquiry確認画面でユーザーが明示的に「新規master登録」を確定して初めて登録し、その結果のmaster IDを使う。

```text
AI推定値
↓
ユーザー確認
├─ 既存masterを選択
└─ 新規master登録を明示確定
↓
master ID取得
↓
Watch / Repair昇格
```

AI推定値を、そのまま正式master登録または昇格へ流してはならない。

## 3. 顧客の決定

Inquiryは `LineUser` 起点であり、Watch / RepairはCustomerを必要とする。

- LINE連携済みの既存Customerを自動候補として提示する。
- 最終的なCustomer選択・確定はユーザーが行う。
- 自動候補だけでCustomerを確定・新規作成しない。

## 4. 昇格単位と一括昇格

昇格単位は `InquiryWatch` ごとである。同一Inquiry内の複数時計は選択して一括昇格できる。

一括昇格は部分成功を許容しない。

```text
複数選択
↓
全件事前検証
↓
問題あり → 1件も作らない

全件OK
↓
1 transaction
↓
Watch + Repairを一括作成
```

事前検証では、対象が同一Inquiryに属すること、選択Customerと確定済みmaster IDが有効であること、必要な昇格入力が揃っていることを確認する。

再実行時の状態は次のように扱う。

- 選択された全件が完全に昇格済みなら、書き込みをせず既存の昇格結果を返す。
- 選択された全件が未昇格なら、通常の昇格処理へ進む。
- 昇格済み・未昇格が混在する、または一件でも昇格結果が部分的にしか保存されていない場合は、0件作成でエラーにする。

事前検証はUXのための早期判定であり、それだけを正しさの根拠にしない。P3-3のtransaction内で、対象InquiryWatchを決定的なID順でロックまたは同等の条件付き更新により確保してから、昇格状態、Customer、master ID、必須入力を再検証する。再検証で一件でも不整合・競合・無効化を検出した場合はtransaction全体を中止し、Watch / Repair / 昇格結果を一件も作成・更新しない。

## 5. 昇格結果と再実行安全性

`InquiryWatch` には、少なくとも以下の昇格結果を保持する候補を設計に含める。

- `promotedWatchId`
- `promotedRepairId`
- `promotedAt`

これらにより、昇格済み結果の参照、二重昇格防止、再実行時の安全な既存結果返却を実現する。
同一InquiryWatchの昇格状態を、複数リクエストが競合しても二重に作成しないことを必須とする。P3-1では昇格結果の1対1関係をDB制約で表現できるかを検討し、P3-3ではその制約とtransaction内のロックまたは条件付き更新を併用する。

## 6. Task境界

| Task | 範囲 |
| --- | --- |
| P3-0 | PartsMaster設計docsのmain反映、Phase 3設計判断の明文化 |
| P3-1 | InquiryWatchを正式登録前の確認用データとして設計・追加 |
| P3-2 | Inquiry確認画面 |
| P3-3 | Watch / Repairへの昇格処理 |
| P3-4 | 二重昇格防止、再実行安全性、AIによる確定値上書き禁止の確認 |
| P3-5以降 | PartsMaster新設計の実装 |

各Taskは1 Task = 1 commitとし、次Taskはユーザー承認なしに開始しない。
schema / migration / production DBを含むTaskは、実装者と独立したレビュー担当による確認を必須とする。
