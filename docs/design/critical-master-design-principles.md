# 時計修理業務アプリ：マスタ設計・入力思想の超重要事項

## 目的

このドキュメントは、時計修理業務管理アプリの今後のDB設計・画面設計・Codex指示で絶対に外してはいけない前提をまとめたものです。

このアプリは、単なる自由入力フォームではなく、**マスタ駆動型の業務入力システム**として作る。

今後の実装・設計では、以下を最重要方針として扱う。

---

## 1. 基本思想

### 1-1. 自由入力を極力避ける

案件入力・部品マスタ入力・見積明細入力は、基本的に候補選択式にする。

NG:

```text
部品名: 3135用ゼンマイ純正AliExpress 12000円
```

OK:

```text
Cal: 3135
標準部品名: ゼンマイ
グレード: 純正
仕入先: AliExpress
価格: 12,000円
```

長い自由入力で意味を詰め込むのではなく、各項目をマスタから選択し、組み合わせで意味を作る。

---

### 1-2. 候補にないものは新規マスタ登録する

候補にないものをその場の自由入力で終わらせない。

候補にない場合は、原則として新規マスタ登録する。

ただし、情報が不確かな場合は以下のような状態を持たせる。

- 未確認
- 要整理
- 未分類
- 仮登録扱い

重要なのは、すべてを「仮」にすることではない。

内容が明確なら、最初から正式マスタとして登録してよい。

---

### 1-3. ドリルダウン入力を基本にする

入力は、上位項目を選ぶことで下位候補が絞り込まれる形にする。

理想の流れ:

```text
Brandを選択
↓
Model候補が絞り込まれる
↓
Modelを選択
↓
WatchRef候補が絞り込まれる
↓
WatchRefを選択
↓
Calが自動確定または候補絞り込みされる
↓
修理内容を選択
↓
部品カテゴリを選択
↓
標準部品名を選択
↓
グレードを選択
↓
PartsMaster候補を選択
↓
技術料・部品価格が自動挿入される
```

---

## 2. マスタ化の判断基準

### 2-1. マスタ化すべき項目

以下に当てはまる項目は、基本的にマスタ化を検討する。

- 候補選択したい
- 他テーブルから参照する
- 検索・集計したい
- 価格ルールに使う
- 表記ゆれを防ぎたい
- ドリルダウンに使う
- 将来、増減・無効化・表示順変更したい
- 業務上、分類や意味が重要

---

### 2-2. ただのカラムでよい項目

以下に当てはまる項目は、必ずしもマスタ化しなくてよい。

- 自由なメモ
- 個体差の説明
- 一回限りの補足
- 数値そのもの
- 厳密な候補管理が不要なもの

例:

- notes1
- notes2
- stockQuantity
- latestCostYen
- retailPrice

ただし、将来検索軸・集計軸・候補選択軸になるなら、後からマスタ化を検討する。

---

## 3. 主要マスタ候補

このアプリでは、以下はマスタ化の重要度が高い。

| 項目 | マスタ化方針 | 理由 |
|---|---|---|
| Brand | 必須 | ドリルダウン起点 |
| Model | 必須 | Brandで絞り込む |
| WatchRef | 必須寄り | Modelで絞り込む。外装部品特定にも重要 |
| Caliber | 必須 | 内装部品・技術料・価格の軸 |
| RepairWork | 必須 | 技術料・修理内容の標準化 |
| PartCategory | 必須 | 部品名候補の絞り込み |
| PartName | 必須 | 標準部品名。表記ゆれ防止 |
| PartGrade | 必須 | 純正/FIT/合わせは別物 |
| Supplier | 必須 | 仕入先別価格・発注管理 |
| PartsMaster | 必須 | 実際の部品候補・在庫・価格 |
| PricingRule | 必須 | 技術料・条件別価格の自動挿入 |

---

## 4. 標準部品名と実部品候補を分ける

### 4-1. PartNameMaster

`PartNameMaster` は、標準部品名を管理する。

例:

```text
ゼンマイ
竜頭
巻真
ガラス
パッキン
ベゼル
針
```

これは「部品の分類名」であり、価格・仕入先・在庫を直接持つものではない。

例:

| key | 日本語名 | 英語名 | 種別 | カテゴリ |
|---|---|---|---|---|
| mainspring | ゼンマイ | mainspring | 内装 | 動力・巻上 |
| crown | 竜頭 | crown | 外装 | 竜頭・チューブ |
| crystal | ガラス | crystal | 外装 | ガラス |

---

### 4-2. PartsMaster

`PartsMaster` は、実際に使える・買える部品候補を管理する。

例:

```text
Cal.3135 / ゼンマイ / 純正 / AliExpress / 12,000円
Cal.3135 / ゼンマイ / FIT / AliExpress / 2,000円
Cal.3135 / ゼンマイ / 純正 / Cousins UK / 10,000円
ROLEX 16233 / 竜頭 / 純正 / 部品Ref 24-603-8
```

同じ `Cal + 標準部品名` でも、以下が違えば別PartsMaster候補として扱う。

- グレード
- 仕入先
- 価格
- 部品Ref
- Cousins番号
- サイズ
- バリエーション
- 在庫
- 保管場所

---

## 5. グレードは重要項目

グレードは単なるラベルではない。

`純正 / FIT / 合わせ` は、価格・品質・仕入先・在庫・顧客説明上まったく別物。

そのため、将来的には `PartGradeMaster` としてマスタ化するのが望ましい。

例:

| key | 日本語名 | 英語名 |
|---|---|---|
| genuine | 純正 | genuine |
| fit | FIT | fit / aftermarket |
| custom_fit | 合わせ | custom fit |

既存DBに `grade` 文字列がある場合は、いきなり削除しない。

安全な移行方針:

```text
既存 grade は残す
↓
gradeId を nullable 追加
↓
新規登録は gradeId 優先
↓
既存データは後続Taskで補正
↓
安定後に旧gradeの扱いを再検討
```

---

## 6. 内装部品と外装部品の考え方

### 6-1. 案件情報は連動する

案件入力では、時計情報は連動する。

例:

```text
ROLEX
↓
Datejust
↓
16233
↓
Cal.3135
```

Brand / Model / WatchRef / Cal はつながっている。

---

### 6-2. 内装部品はCal中心

内装部品は、主にCalを軸に候補を絞る。

例:

```text
ROLEX / Cal.3135 / ゼンマイ / 純正
ETA / 2824-2 / 巻真 / FIT
OMEGA / Cal.1120 / 切替車
```

内装部品では以下が重要。

- Cal
- ベースCal
- 互換Cal
- movementMaker
- standardPartName
- grade
- supplier
- price
- stock

Brand / Model / WatchRef も案件情報として重要だが、部品候補検索ではCalが強い。

---

### 6-3. 外装部品の候補特定優先順位

外装部品は、以下の順で候補特定する。

#### 1. 部品Ref

例:

```text
24-603-8
```

部品Refが分かっている場合は最も強い。

特にROLEXなど、部品Refデータがあるものはドンピシャ一致を最優先する。

ただし、部品Refは公表されていない・調べにくい・照合しにくいことも多い。

---

#### 2. WatchRef + 標準部品名

例:

```text
ROLEX / 16233 / 竜頭
ROLEX / 1601 / ガラス
```

部品Refが不明な場合、実務上もっとも使う検索軸。

---

#### 3. モデル名 + サイズ + バリエーション

例:

```text
Datejust / ガラス径 / ドーム形状
```

曖昧ではあるが、1/10mm単位で一致する場合は専用品として判断できることがある。

FIT品・合わせ品では実害が少ない場合もある。

---

### 6-4. 外装部品で重要な項目

外装部品では以下が重要。

- Brand
- Model
- WatchRef
- 標準部品名
- 部品Ref
- Cousins番号
- サイズ
- バリエーション
- グレード
- 仕入先
- 価格
- 在庫
- 備考

---

## 7. 価格自動挿入の考え方

価格自動挿入は、主に2種類ある。

### 7-1. PartsMaster由来の価格

実部品候補を選んだときに、その部品候補の価格を明細へ反映する。

例:

```text
3135 / ゼンマイ / 純正 / Cousins UK / 10,000円
```

この候補を選べば、PartsMaster側の価格を明細に反映できる。

---

### 7-2. PricingRule由来の価格

技術料・作業料金・条件別の標準価格は `PricingRule` で管理する。

例:

```text
ROLEX / Cal.3135 / オーバーホール
ROLEX / Cal.3135 / ゼンマイ交換 技術料
ROLEX / 16233 / 竜頭交換 技術料
```

したがって、

```text
PricingRuleがないと価格自動挿入が一切できない
```

という意味ではない。

部品価格はPartsMasterから、技術料や条件別標準価格はPricingRuleから取る。

---

### 7-3. 価格ルールの優先順位

価格自動挿入では、完全一致を優先し、なければ広い条件へフォールバックする。

例:

```text
1. WatchRef + Cal + 修理内容 + 標準部品名 + グレード
2. Cal + 修理内容 + 標準部品名 + グレード
3. Brand + 修理内容 + 標準部品名
4. 修理内容 + 標準部品名
5. 見つからなければ手動確認
```

---

## 8. 自由入力ではなく、選択式で分ける例

以下の3つは、すべて「ゼンマイ」という同じ標準部品名に紐づくが、実部品候補としては別物。

```text
3135 / ゼンマイ / 純正 / AliExpress / 12,000円
3135 / ゼンマイ / FIT / AliExpress / 2,000円
3135 / ゼンマイ / 純正 / Cousins UK / 10,000円
```

これはこう分ける。

```text
Caliber: 3135
PartNameMaster: ゼンマイ
PartGradeMaster: 純正 or FIT
Supplier: AliExpress or Cousins UK
PartsMaster: 実部品候補
Price: PartsMaster上の価格
```

「3135用ゼンマイ純正AliExpress 12000円」という文字列に詰め込まない。

---

## 9. 既存DB・コードの棚卸しが必要

現時点では、既存DBに以下のような分類系カラムがある可能性がある。

- partType
- category
- subcategory
- grade
- name
- nameJp
- nameEn

これらと、新しく作る可能性のある以下のマスタが重複しないように、Task028でschema変更する前に棚卸しが必要。

- PartCategoryMaster
- PartNameMaster
- PartGradeMaster

確認すべきこと:

- `partType` は何を意味しているか
- `category` は何を意味しているか
- `subcategory` は何を意味しているか
- `grade` はどこで使われているか
- 内装/外装を表す語が混在していないか
- `internal / external / interior / exterior / part_internal / part_external` が混線していないか
- 既存カラムを残すか、deprecated扱いにするか

---

## 10. 既存カラムはすぐ削除しない

既存カラムは、いきなり削除しない。

安全な進め方:

```text
新マスター・新relationをnullableで追加
↓
既存保存処理は壊さない
↓
新規登録から新マスター参照を使う
↓
既存データを補正
↓
画面・検索・Web検索・発注で新マスターを優先
↓
安定後に旧カラムの扱いを再検討
```

---

## 11. Codexへの重要禁止事項

今後Codexへ指示するときは、以下を必ず守らせる。

- 不要なリファクタリング禁止
- 指示範囲外の変更禁止
- 既存UIの全面刷新禁止
- 既存DBカラムの即削除禁止
- migrationを勝手に作らない
- stashを勝手に戻さない
- Task025 / Task026 に勝手に触らない
- `RepairEntryForm.tsx` を不要に触らない
- `PartsForm` のUIを大きく作り直さない
- 標準部品名・カテゴリ・グレードの意味を自由入力に戻さない

---

## 12. 次にやるべきこと

Task028でschema変更に進む前に、Task027.5として以下を行う。

### Task027.5: DB分類・マスタ化範囲の棚卸し

目的:

```text
既存DBとコード内の分類系ワードを棚卸しし、
どの項目をマスタ化すべきか、
既存カラムと新マスターの役割分担を整理する。
```

調査対象:

- prisma/schema.prisma
- src/lib/part-input-options.ts
- src/components/parts/PartsForm.tsx
- src/components/parts/PartsSearchPanel.tsx
- src/components/parts/PartsWebSearchPanel.tsx
- src/lib/part-search.ts
- src/lib/parts-master.ts
- src/app/api/parts/search/route.ts
- src/app/api/repairs/route.ts
- src/app/api/repairs/[id]/route.ts

調査すべき内容:

- 既存 `partType / category / subcategory / grade` の意味
- 内装/外装を表す語の混在
- PartCategoryMaster / PartNameMaster / PartGradeMaster の必要性
- Supplier / PricingRule / PartsMasterとの関係
- 既存データ移行方針
- Task028で追加すべきschema案

---

## 13. 最重要結論

このアプリは、自由入力中心ではなく、**マスタ駆動・候補選択・ドリルダウン入力**を前提に設計する。

特に以下は重要。

```text
Brand
Model
WatchRef
Caliber
RepairWork
PartCategory
PartName
PartGrade
Supplier
PartsMaster
PricingRule
```

これらは、検索・集計・価格・在庫・発注に関わるため、適切にマスタ化する。

標準部品名・グレード・仕入先・価格をひとつの文字列に詰め込まない。

PartsMasterは、実際に使える・買える部品候補を表す。

PartNameMasterは、ゼンマイ・竜頭・ガラスなどの標準部品名を表す。

PartGradeMasterは、純正・FIT・合わせなど、業務上まったく別物になるグレードを表す。

この前提を外すと、後続の検索・発注・在庫・価格自動挿入が破綻する。
