# AI Task 027.5: PartsMaster分類・マスタ化範囲の棚卸し

## 目的

Task028でPrisma schemaを変更する前に、既存DB・コード内の分類系カラムと命名を棚卸しし、今後どの項目をマスタ化すべきか整理する。

今回は調査docsのみ作成する。Prisma schema変更、migration作成、TypeScript/React/API変更は行わない。

## 前提として読んだファイル

- `docs/design/critical-master-design-principles.md`
- `docs/ai-tasks/027-design-parts-master-standard-part-name-schema.md`

この2ファイルの方針から、以下を前提にする。

- 自由入力を極力避け、候補選択式を基本にする。
- Brand -> Model -> WatchRef -> Cal のようにドリルダウンで絞り込む。
- 部品カテゴリ、標準部品名、グレードは検索・集計・価格・在庫・発注に関わるためマスタ化候補として扱う。
- 現在のPartsForm UIは大きく作り直さない。
- 最小実装では現在のPartsForm UIを活かし、裏側の保存先を追加する。
- `part-input-options.ts` のkey保存を優先しつつ、長期的には `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` を検討する。

## 調査対象ファイル

- `prisma/schema.prisma`
- `src/lib/part-input-options.ts`
- `src/components/parts/PartsForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsWebSearchPanel.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/parts/search/route.ts`
- `src/app/api/repairs/route.ts`
- `src/app/api/repairs/[id]/route.ts`
- `docs/design/critical-master-design-principles.md`
- `docs/ai-tasks/027-design-parts-master-standard-part-name-schema.md`

## 調査1: 既存PartsMaster分類系カラムの棚卸し

| カラム | 現在の意味 | 想定値 | 参照・更新箇所 | 用途 | 新マスターとの重複 | 方針 |
|---|---|---|---|---|---|---|
| `partType` | 内装/外装の大分類 | `interior`, `exterior`, nullable | `PartsForm`, `PartsSearchPanel`, `parts search API`, `parts-master.ts`, repair API | UI切替、検索、保存 | `partInputType` / `PartCategoryMaster.partDomain` と重複しやすい | 当面残す。新規は標準分類へ寄せ、将来deprecated候補 |
| `category` | 既存互換の分類 | `internal`, `external`, `generic`, それ以外の文字列 | `PartsForm`, `parts-master.ts`, repair API | 保存、内外装推定 | `PartCategoryMaster` と強く重複 | 当面残す。標準 `partCategoryId` / `partCategoryKey` が安定後にdeprecated候補 |
| `subcategory` | 内装サブカテゴリ | 地板/受け、輪列、巻上、調速、裏まわり等 | `PartsForm` UI、`parts-master.ts` | UI入力、保存 | `PartCategoryMaster` と強く重複 | 新規UIでは表示しない。既存state/payload互換だけ残す候補 |
| `grade` | 純正/FIT/合わせなどの実部品グレード | `純正`, `FIT`, `合わせ` | `PartsForm`, `PartsSearchPanel`, repair API, line item反映 | 表示、検索、価格、在庫、候補分岐 | `PartGradeMaster` と重複 | 当面残す。`gradeId` 追加後は表示互換/移行用 |
| `name` | legacy名 | 基本 `nameJp` と同じ | `PartsForm` payload, `parts-master.ts` | 既存互換 | `nameJp` と重複 | 残す。新設計の主軸にしない |
| `nameJp` | 表示用の日本語部品名 | ゼンマイ、竜頭など | `PartsForm`, `PartsSearchPanel`, search API, repair API, OrderRequest | 表示、検索、帳票、発注名 | `PartNameMaster.nameJa` と一部重複 | 残す。標準名ではなく表示・帳票用 |
| `nameEn` | 表示/検索用の英語部品名 | mainspring, crownなど | `PartsForm`, `PartsSearchPanel`, search API, OrderRequest, Web検索 | 表示、検索、Web検索、発注名 | `PartNameMaster.nameEn` と一部重複 | 残す。標準名ではなく表示・帳票用 |
| `partRefs` | 部品Ref | 24-603-8、1530-0005など、カンマ区切りあり | `PartsForm`, `PartsSearchPanel`, search API, repair API, OrderRequest | 検索、候補特定、発注 | PartNameではなく実部品特定情報 | 残す。外装検索では最優先軸 |
| `cousinsNumber` | Cousins番号 | サイト固有品番 | `PartsForm`, `PartsSearchPanel`, repair API, OrderRequest | 発注、検索、候補特定 | Supplier品番に近い | 残す。将来はSupplierPartRef化も検討 |
| `supplierId` | 仕入先FK | Supplier.id | `PartsForm`, `PartsSearchPanel`, repair API, OrderRequest | 発注、在庫、価格 | Supplierマスターを参照済み | 残す。PartsMaster実候補の分岐軸 |
| `brandId` | 外装用ブランド、または部品適合ブランド | Brand.id | `PartsForm`, search API, `parts-master.ts`, repair API | 外装検索、候補特定 | Brandマスターを参照済み | 残す |
| `modelId` | 外装用モデル | Model.id | `PartsForm`, `parts-master.ts`, search API | 外装検索、候補特定 | Modelマスターを参照済み | 残す |
| `caliberId` | 内装用Cal | Caliber.id | `PartsForm`, search API, `parts-master.ts`, repair API | 内装検索、候補特定 | Caliberマスターを参照済み | 残す |
| `movementMakerId` | ムーブメント製造元 | Brand.id | `PartsForm`, `parts-master.ts`, repair API | 内装検索、候補特定 | Brandマスターを参照済み | 残す |
| `baseCaliberId` | ベースCal | Caliber.id | `PartsForm`, search API, `parts-master.ts` | 内装検索、互換候補 | Caliberマスターを参照済み | 残す |

重点所見:

- `partType` は主に `interior/exterior` で、内装/外装の大分類として使われている。
- `category` は `internal/external/generic` の既存互換が中心で、標準部品カテゴリとしては粗い。
- `subcategory` は今後の `PartCategoryMaster` と役割が重複する。Task026で指摘された通り、ムーブメント情報内UIからは外す方針が妥当。
- `grade` は単なる表示ラベルではなく、価格・品質・仕入先・在庫・顧客説明に関わるため `PartGradeMaster` 化の優先度が高い。
- `supplierId + grade + partRefs/cousinsNumber + PartsMaster` の組み合わせで実部品候補は分けられるが、現在は `grade` が文字列のため表記ゆれに弱い。

## 調査2: 内装/外装を表す語の棚卸し

| 語 | 出現箇所 | 意味 | DB保存値か | 用途 | 注意点 |
|---|---|---|---|---|---|
| `part_internal` | `part-input-options.ts`, repair API判定, `part-search.ts` | 部品入力候補側の内装 | DB保存される可能性あり | 候補定義、内装判定 | `interior` と別体系 |
| `part_external` | `part-input-options.ts` | 部品入力候補側の外装 | DB保存される可能性あり | 候補定義 | `exterior` と別体系 |
| `internal` | `PartsMaster.category`, `parts-master.ts`, repair API判定, `part-search.ts` | 既存互換の内装カテゴリ | DB保存値 | 内装推定 | `part_internal` / `interior` と混在 |
| `external` | `PartsMaster.category`, `parts-master.ts` | 既存互換の外装カテゴリ | DB保存値 | 外装推定 | `part_external` / `exterior` と混在 |
| `interior` | `PartsMaster.partType`, `PartsForm`, `PartsSearchPanel`, repair API | 内装大分類 | DB保存値 | UI切替、検索 | 現行UI/APIの主分類 |
| `exterior` | `PartsMaster.partType`, `PartsForm`, `PartsSearchPanel` | 外装大分類 | DB保存値 | UI切替、検索 | 現行UI/APIの主分類 |
| `inside` | 調査対象では主要用途なし | なし | なし | なし | 使用しない |
| `outside` | 調査対象では主要用途なし | なし | なし | なし | 使用しない |
| `movement` | Repairのムーブメント情報、PartsMaster内装条件、part-input-optionsの内装属性 | ムーブメント/内装条件 | 一部DB保存 | Cal, movementMaker, movementTarget | 内装分類そのものではなく、時計機械情報を指す場合が多い |
| `casing` | 調査対象では主要用途なし | なし | なし | なし | 使用しない |
| `case` | part-input-optionsの外装カテゴリ/部品名 | ケース系外装部品 | 候補key | 外装部品カテゴリ/部品名 | `case` は外装部品であり、内外装分類ではない |
| `外装` | UI表示、コメント、候補ラベル | 外装表示 | なし | UI表示 | DB値ではない |
| `内装` | UI表示、コメント、候補ラベル | 内装表示 | なし | UI表示 | DB値ではない |

紛らわしい点:

- `interior/exterior` は現行PartsMasterの大分類。
- `part_internal/part_external` は `part-input-options.ts` の候補分類。
- `internal/external` は既存 `category` の互換値。
- 3種類が同時に存在するため、Task028で新規カラムを追加するなら命名を明確にする必要がある。

推奨命名:

- DB上の新規標準分類は `partDomainKey` または `partInputTypeKey` のように、既存 `partType` と区別する。
- 値は `part_internal` / `part_external` に寄せると `part-input-options.ts` と対応しやすい。
- 既存 `partType` は当面 `interior/exterior` のまま互換維持する。

## 調査3: マスタ化すべき項目の判定

| 項目 | マスタ化すべきか | 既存マスタ | 既存カラムで足りるか | Task028で扱うべきか | 方針 |
|---|---|---|---|---|---|
| Brand | 必須 | `Brand` | 足りる | 触らない | 既存維持 |
| Model | 必須 | `Model` | 足りる | 触らない | 既存維持 |
| WatchRef | 必須寄り | `WatchReference` | おおむね足りる | 触らない | Brand/Model/Calドリルダウン軸として維持 |
| Caliber | 必須 | `Caliber` | 足りる | 触らない | 内装検索の主軸 |
| RepairWork | 必須 | schema上は専用マスタ未確認、`PricingRule.suggestedWorkName`あり | 不十分 | Task028では触らない | 別TaskでRepairWorkMaster検討 |
| PartCategory | 必須 | なし、`part-input-options.ts` 定義のみ | 不十分 | 検討対象 | `PartCategoryMaster` またはkeyカラム追加 |
| PartName | 必須 | なし、`part-input-options.ts` 定義のみ | 不十分 | 検討対象 | `PartNameMaster` またはkey/ID追加 |
| PartGrade | 必須 | なし、PartsMaster.grade文字列のみ | 不十分 | 検討対象 | `PartGradeMaster` と `gradeId` 追加 |
| Supplier | 必須 | `Supplier` | 足りる | 触らない | 既存維持 |
| PricingRule | 必須 | `PricingRule` | 技術料中心で部品標準分類とは未連動 | Task028では触らない | 後でPartName/Gradeとの連携検討 |
| PartsMaster | 必須 | `PartsMaster` | 実部品候補として必要 | 中心 | 実部品候補、価格、在庫、発注の中心 |
| size | 条件付き | なし | 文字列で開始可 | Task028では原則触らない | 外装検索で重要だが当面カラム |
| variant | 将来候補 | なし | 現在カラムなし | Task028では慎重 | ガラス形状等。必要ならnullable |
| material | 将来候補 | なし | 現在カラムなし | Task028では触らない | 外装部品で必要になったら追加 |
| color | 将来候補 | なし | 現在カラムなし | Task028では触らない | 文字盤/ベゼル等で必要になったら追加 |
| location | カラムでよい | なし | 足りる | 触らない | 保管場所メモ/棚番 |
| notes1 | カラムでよい | なし | 足りる | 触らない | 自由メモ |
| notes2 | カラムでよい | なし | 足りる | 触らない | 自由メモ |

## 調査4: 標準部品名・カテゴリ・グレードのマスター化検討

### PartCategoryMaster

マスタ化の価値が高い。

理由:

- 部品名候補のドリルダウンに使う。
- 内装/外装分類とカテゴリの意味を分離できる。
- 表示順・有効/無効を管理しやすい。
- `category` / `subcategory` の混在を整理できる。

ただし、Task028でいきなり導入するとPartsForm、検索API、seed/初期データが必要になる。

### PartNameMaster

マスタ化の価値が非常に高い。

理由:

- 標準部品名の中心。
- Web検索語生成、PartsSearchPanel、在庫集計、発注に効く。
- `nameJp/nameEn` の表記ゆれを抑えられる。
- `part-input-options.ts` の `PartNameOption.key` と自然に対応できる。

### PartGradeMaster

マスタ化の価値が高い。

理由:

- `純正/FIT/合わせ` は価格・品質・顧客説明・在庫・仕入先に関わる。
- PartsMasterの実候補を分ける軸。
- 文字列のままだと `純正`, `GENUINE`, `正規`, `FIT品` などに揺れる。

### PartsMasterへのrelation案

候補:

- `partCategoryId`
- `standardPartNameId`
- `gradeId`

併用候補:

- `partCategoryKey`
- `standardPartNameKey`
- `gradeKey`

判断:

- 長期安定性はID relationが強い。
- 既存UIを大きく変えず、現在の `part-input-options.ts` から段階移行するならkeyカラムの方が最小差分。
- 実務アプリとしては、最終的にID relationへ寄せる価値が高い。

## 調査5: 方式比較

### 案A: PartsMasterに文字列keyを直接追加する方式

例:

```prisma
partInputType       String?
partCategoryKey     String?
standardPartNameKey String?
gradeKey            String?
```

利点:

- 最小差分。
- 既存PartsForm UIを維持しやすい。
- `part-input-options.ts` のkeyをそのまま保存できる。
- 既存データ移行時にnullable追加しやすい。
- Task028のmigrationリスクが低い。

弱点:

- key/nameの整合性をDBで保証しづらい。
- 表示順、有効/無効、alias管理はコード定義依存。
- 将来、DB上で候補追加したい場合に再設計が必要。
- `gradeKey` も文字列だと、PartGradeの意味管理は弱い。
- `standardNameJa` / `standardNameEn` をPartsMasterに持つと、keyと表示名のズレが起きる。
- 後からマスターテーブル化する場合、二重管理と再移行が発生しやすい。

### 案B: マスターテーブル方式

例:

```prisma
model PartCategoryMaster { ... }
model PartNameMaster { ... }
model PartGradeMaster { ... }

model PartsMaster {
  partCategoryId     Int?
  standardPartNameId Int?
  gradeId            Int?
}
```

利点:

- 業務アプリとして長期安定性が高い。
- key/nameズレを防ぎやすい。
- 候補追加、無効化、表示順変更をDBで扱える。
- PartsSearchPanel、Web検索、PricingRule、在庫/発注で参照しやすい。
- PartGradeを価格・仕入先・表示・集計の軸にできる。

弱点:

- Task028でテーブル追加が必要。
- 初期データ投入方針が必要。
- PartsForm、API、検索、補正処理への接続は後続Taskに分ける必要がある。
- 既存データ移行時にID解決が必要。

### 比較まとめ

| 観点 | 案A: key直接追加 | 案B: マスターテーブル |
|---|---|---|
| 最小差分 | 強い | 弱い |
| 既存PartsFormへの影響 | 小さい | 中 |
| PartsSearchPanelへの影響 | 小-中 | 中 |
| Web検索語生成への影響 | 小 | 中 |
| Repair APIへの影響 | 小 | 中 |
| Parts search APIへの影響 | 小 | 中 |
| 発注・在庫管理への影響 | 段階対応 | 長期的に強い |
| PricingRule連携 | 弱い | 強い |
| key/nameズレ防止 | 弱い | 強い |
| 候補追加・無効化・表示順 | 弱い | 強い |
| 既存データ移行 | 容易 | 中 |
| migrationリスク | 低 | 中 |
| 長期安定性 | 中 | 高 |

推奨:

- Task028の本命方針は案Bにする。
- `PartCategoryMaster` / `PartNameMaster` / `PartGradeMaster` を追加し、PartsMasterにはnullable relationを追加する。
- 既存UI/APIは一気に作り直さず、接続は後続Taskに分ける。
- 既存の `partType`, `category`, `subcategory`, `grade`, `nameJp`, `nameEn` は削除しない。
- 案Aの文字列key追加は、migrationリスクをさらに下げるための代替案に留める。
- `standardNameJa` / `standardNameEn` のような標準名スナップショットをPartsMasterに増やすより、標準名は `PartNameMaster` から取得する方がよい。

## 調査6: 外装部品検索優先順位

外装部品の候補特定優先順位:

1. 部品Ref
   - 例: `24-603-8`
   - データがある場合は最も強い。
   - ROLEXなど部品Refが分かるものは、ドンピシャ一致を最優先。
2. WatchRef + 標準部品名
   - 例: `ROLEX / 16233 / 竜頭`
   - 部品Refが不明な場合に実務上よく使う軸。
3. モデル名 + サイズ + バリエーション
   - 例: `Datejust / ガラス径 / ドーム形状`
   - 曖昧だが、1/10mm単位で一致する場合は専用品として判断できることがある。
   - FIT品・合わせ品では実害が少ない場合がある。

設計上の注意:

- `partRefs` はPartsMasterに残す。
- `standardPartNameId` は外装検索の第二軸にする。
- `gradeId` は純正/FIT/合わせの候補分岐に必須。
- `size` は当面文字列でよいが、ガラスやパッキンで検索軸になる。
- `variant` は将来追加候補。Task028で追加するならnullableにする。
- `PartNameMaster` は「竜頭」「ガラス」「パッキン」など標準名を管理し、実部品Refや価格はPartsMasterに持たせる。

## 調査7: 内装部品検索

内装部品の候補特定軸:

- Cal
- ベースCal
- 互換Cal
- movementMaker
- standardPartName
- grade
- supplier
- price
- stock

設計上の注意:

- 内装部品では `caliberId` が強い検索軸。
- `baseCaliberId` は互換候補を広げる軸。
- `movementMakerId` はBrandとは別に必要。
- `standardPartNameId` がないと、ゼンマイ/巻真/香箱などの表記ゆれで候補が割れる。
- `gradeId` は純正/FIT/合わせの候補分岐に必要。
- `supplierId` と `latestCostYen` は実部品候補としてのPartsMasterに残す。
- 互換Calは将来的に `CaliberCompatibility` のようなテーブルも検討できるが、Task028では触らない。

## 調査8: 既存データ移行方針

既存データは壊さず、段階移行する。

- `nameJp/nameEn` から `PartNameMaster` を推測できるものだけ `standardPartNameId` を補正する。
- `grade` から `PartGradeMaster` を推測できるものだけ `gradeId` を補正する。
- `category/subcategory` から `PartCategoryMaster` を推測できるものだけ `partCategoryId` を補正する。
- 推測できないものはnullのまま残す。
- 既存カラムはすぐ削除しない。
- 新規登録から新マスター参照を使う形へ徐々に寄せる。
- 既存データ補正はTask031以降に分ける。

補正例:

- `nameJp = ゼンマイ` -> `PartNameMaster.key = mainspring` を探し、`standardPartNameId` に保存
- `grade = 純正` -> `PartGradeMaster.key = genuine` を探し、`gradeId` に保存
- `grade = FIT` -> `PartGradeMaster.key = fit` を探し、`gradeId` に保存
- `category = internal` + `subcategory = 巻上` -> `PartCategoryMaster.key = mainspring_barrel` の候補を探し、`partCategoryId` に保存

移行時の注意:

- `nameJp/nameEn/grade/category/subcategory` は互換用として残す。
- `standardNameJa/standardNameEn` をPartsMasterへ追加して二重管理しない。
- 補正できない行を無理に推測しない。
- 既存データ補正UIまたは補正リストは別Taskに分ける。

## 調査9: 推奨schema案

### PartCategoryMaster案

```prisma
model PartCategoryMaster {
  id         Int      @id @default(autoincrement())
  key        String   @unique
  partDomain String   // part_internal | part_external
  nameJa     String
  nameEn     String?
  sortOrder  Int      @default(0)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  partNames  PartNameMaster[]
}
```

### PartNameMaster案

```prisma
model PartNameMaster {
  id         Int      @id @default(autoincrement())
  key        String   @unique
  categoryId Int
  partDomain String   // part_internal | part_external
  nameJa     String
  nameEn     String
  displayJa  String?
  displayEn  String?
  sortOrder  Int      @default(0)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  category   PartCategoryMaster @relation(fields: [categoryId], references: [id])
  parts      PartsMaster[]
}
```

### PartGradeMaster案

```prisma
model PartGradeMaster {
  id        Int      @id @default(autoincrement())
  key       String   @unique
  nameJa    String
  nameEn    String?
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  parts     PartsMaster[]
}
```

### PartsMaster追加候補

非推奨寄りの案A:

```prisma
partInputType       String?
partCategoryKey     String?
standardPartNameKey String?
gradeKey            String?
```

本命の案B:

```prisma
partCategoryId      Int?
standardPartNameId  Int?
gradeId             Int?

partCategory        PartCategoryMaster? @relation(fields: [partCategoryId], references: [id])
standardPartName    PartNameMaster?     @relation(fields: [standardPartNameId], references: [id])
gradeMaster         PartGradeMaster?    @relation(fields: [gradeId], references: [id])
```

折衷案:

```prisma
partInputType       String?
partCategoryKey     String?
standardPartNameKey String?
gradeKey            String?

partCategoryId      Int?
standardPartNameId  Int?
gradeId             Int?
```

折衷案は重複が増えるため、Task028では原則避ける。採用する場合でも、`standardNameJa` / `standardNameEn` をPartsMasterに増やすのは避け、標準名は `PartNameMaster` から取得する。

## 推奨方針

Task028では、マスターテーブル方式を第一候補にする。

追加候補:

- `PartCategoryMaster`
- `PartNameMaster`
- `PartGradeMaster`

PartsMasterに追加するnullable relation:

- `standardPartNameId`
- `gradeId`

必要に応じて検討するnullable relation:

- `partCategoryId`

理由:

- 標準部品名・カテゴリ・グレードは、候補選択・検索・価格・在庫・発注に関わる重要マスタである。
- グレードは純正/FIT/合わせで価格・品質・仕入先・在庫上まったく別物なので、`gradeKey` 文字列だけでは弱い。
- `standardNameJa` / `standardNameEn` をPartsMasterに保存すると、key/nameズレが起きる。
- 標準名は `PartNameMaster` から取得する方がよい。
- PartsMasterに文字列keyを追加してから後でマスター化すると、二重管理と再移行が発生しやすい。
- 既存カラムは削除せず、nullable relation追加で段階移行できる。

維持する考え方:

- 既存UI/APIは一気に大きく変更しない。
- 既存カラムは残す。
- 新マスターとnullable relationを追加する。
- 新規登録から徐々に新マスター参照へ寄せる。
- 既存データ補正は後続Taskに分ける。
- UI/API連携もさらに後続Taskに分ける。

## Task028へ進めるか

進めてよい。

修正後のTask028案:

1. `PartCategoryMaster`, `PartNameMaster`, `PartGradeMaster` を追加する。
2. PartsMasterに `standardPartNameId` と `gradeId` をnullableで追加する。
3. `partCategoryId` は、`PartNameMaster.categoryId` から辿れるため必須ではない。ただし検索効率や移行作業の明確さが必要ならnullableで追加を検討する。
4. 既存の `partType`, `category`, `subcategory`, `grade`, `nameJp`, `nameEn` は削除しない。
5. `part-input-options.ts` 由来の初期データ投入方針をTask028内または直後Taskで整理する。
6. PartsForm/UI/API連携はTask029以降に分ける。
7. 既存データ補正はTask031以降に分ける。

## コード/schema変更していないこと

今回変更したのはこの調査docsのみ。

- `prisma/schema.prisma` は変更していない。
- migrationは作成していない。
- TypeScriptコードは変更していない。
- React/UIコードは変更していない。
- APIコードは変更していない。
- stashは戻していない。
- Task025 / Task026 には触っていない。
