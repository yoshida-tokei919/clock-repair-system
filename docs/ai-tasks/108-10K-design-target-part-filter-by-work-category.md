# Task 108-10K: 作業カテゴリに応じた対象部品候補絞り込みの設計

## 目的

RepairEntryForm の構造化作業入力で、技術料行の「対象部品」候補を作業カテゴリに応じて絞り込むための調査・設計を行う。

このTaskでは実装しない。schema変更、migration、seed、DB操作、API変更、UI変更、PartsMaster検索変更は行わない。

## 背景

現在の構造化作業入力には以下がある。

```txt
作業カテゴリ select
対象部品 select
処置 select
detail 入力
```

ただし、対象部品 select は `getInternalPartNameMasters()` で取得した内装 PartNameMaster 全体を表示している。候補数が多いため、実務入力では探しにくい。

次段階では、作業カテゴリを選んだら、そのカテゴリに関係する対象部品だけを表示したい。

## 現状の構造化作業入力

`src/components/repairs/RepairEntryForm.tsx` では、以下の state を持つ。

```txt
newWorkCategoryId
newWorkCategorySnapshot
newTargetPartNameId
newTargetPartNameSnapshot
newWorkActionId
newWorkActionSnapshot
newWorkDetailLabel
```

候補データは初期表示時に以下をまとめて取得している。

```txt
getRepairWorkCategories()
getRepairWorkActions()
getInternalPartNameMasters()
```

保存payloadでは、PART行では構造化作業fieldを `null` にし、LABOR行だけに以下を載せている。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

## targetPartNameId と partsMasterId の違い

このTaskの対象は `targetPartNameId` の候補絞り込みである。

```txt
targetPartNameId
→ LABOR行の「作業対象部品」
→ PartNameMaster由来
→ 例: ゼンマイ、キチ車、一番受け、ツヅミ車
```

以下は対象外。

```txt
partsMasterId
→ PART行の「実際に使う/交換する在庫・部品マスタ」
→ PartsMaster由来
→ 部品検索・在庫・発注・価格・仕入先と関係する
```

したがって、今回の設計では以下を変更しない。

```txt
PartsMaster検索ロジック
getPartsMatched
PartsSearchPanel
partsMasterIdの扱い
交換部品行の動作
部品パネルの検索仕様
```

## 既存モデル調査

### RepairWorkCategory

`prisma/schema.prisma` の現行モデル。

```txt
id Int
repairType RepairWorkType
parentId Int?
name String
displayName String
description String?
sortOrder Int
isActive Boolean
```

現状 seed 済みの INTERNAL 親カテゴリは11件。

```txt
movement / ムーブメント
quartz / クォーツ
power_winding / 動力・巻上
train_wheel / 輪列
escapement / 脱進機
regulator / 調速機
hand_setting / 針回し
calendar / カレンダー
automatic_winding / 自動巻
chronograph / クロノグラフ
main_plate / 地板
```

### RepairWorkAction

`RepairWorkAction` は12処置のマスタとして存在する。

```txt
name
displayName
sortOrder
isActive
```

今回の候補絞り込みでは処置マスタは直接使わない。

### PartCategoryMaster

`PartCategoryMaster` は以下を持つ。

```txt
id String
key String
partType String
nameJa String
nameEn String?
sortOrder Int
isActive Boolean
```

内装部品カテゴリは `part_internal` として定義されている。

作業カテゴリと部品カテゴリのkeyは完全一致しない。

```txt
RepairWorkCategory.power_winding
→ PartCategoryMaster.mainspring_barrel

RepairWorkCategory.regulator
→ PartCategoryMaster.balance

RepairWorkCategory.hand_setting
→ PartCategoryMaster.keyless_works
```

### PartNameMaster

`PartNameMaster` は以下を持つ。

```txt
id String
key String
categoryId String
partType String
nameJa String
nameEn String?
displayJa String?
displayEn String?
sortOrder Int
isActive Boolean
```

`RepairLineItem.targetPartNameId` と `RepairWorkName.targetPartNameId` は `PartNameMaster.id` を参照する。

### PartsMaster

`PartsMaster` は実部品・在庫・価格・仕入・品番などのためのレコードである。

今回の対象部品候補絞り込みでは参照しない。

### RepairLineItem

現行 `RepairLineItem` には以下の構造化fieldが存在する。

```txt
repairWorkCategoryId
repairWorkActionId
targetPartNameId
detailLabelSnapshot
categoryNameSnapshot
targetPartNameSnapshot
actionNameSnapshot
```

このTaskは保存済みfieldの表示元・保存元を変えるものではなく、新規入力時の対象部品候補を絞る設計である。

## 既存master-actions調査

`src/actions/master-actions.ts` には以下がある。

### getRepairWorkCategories()

```txt
RepairWorkType.INTERNAL
isActive = true
sortOrder / displayName / name 順
```

返却値。

```txt
id
name = displayName || name
key = name
sortOrder
```

次実装では `key` を使ってカテゴリ別マッピングできる。

### getRepairWorkActions()

処置候補を返す。今回の絞り込み対象ではない。

### getInternalPartNameMasters()

以下の条件で内装 PartNameMaster を返している。

```txt
isActive = true
partType in ['part_internal', 'internal', 'interior']
または category.partType in ['part_internal', 'internal', 'interior']
```

返却値。

```txt
id
name = displayJa || nameJa
key
sortOrder
categoryName = category.nameJa || category.key
```

現状は作業カテゴリID/keyを受け取らず、内装部品名全件を返す。

次実装でフロント側絞り込みをするなら、既存関数は変更せず、返却済みの `key` を使えばよい。

サーバー側取得関数を拡張するなら、`category.key` も返す必要がある。現在は `categoryName` は返すが、`category.key` は返却していない。

## PartNameMaster / PartCategoryMaster / RepairWorkCategory の関係

現schemaには `RepairWorkCategory` と `PartNameMaster` を直接紐づける中間テーブルは存在しない。

現状の関係は以下。

```txt
RepairWorkCategory
→ 作業カテゴリ

PartCategoryMaster
→ 部品カテゴリ

PartNameMaster
→ 部品名
```

作業カテゴリと部品カテゴリは概念として近いが、同一ではない。

```txt
作業カテゴリ: power_winding / 動力・巻上
部品カテゴリ: mainspring_barrel / 動力・巻上系部品

作業カテゴリ: regulator / 調速機
部品カテゴリ: balance / 調速機系部品

作業カテゴリ: hand_setting / 針回し
部品カテゴリ: keyless_works / 針回し・巻真・裏回り系部品
```

そのため、単純に `RepairWorkCategory.name === PartCategoryMaster.key` で絞るだけでは不足する。

## 既存seedの確認結果

`prisma/seed.ts` では `RepairWorkCategory` INTERNAL 11件をseedしている。

`src/lib/part-input-options.ts` と `scripts/seed-part-standard-masters.ts` で `PartCategoryMaster / PartNameMaster` の標準部品マスタをseedしている。

内装部品カテゴリの主なkey。

```txt
mainspring_barrel
train_wheel
escapement
balance
keyless_works
calendar
automatic_winding
chronograph
quartz
main_plate
```

作業カテゴリ側の `movement` は、部品カテゴリ側に1対1対応するカテゴリがない。全体・ムーブメント一式・基本整備寄りの作業カテゴリとして扱うのが自然である。

五番車については、正式参照候補はクォーツ側の `fifth_wheel_quartz` とする。train_wheel側の既存 `fifth_wheel` は旧seed/旧候補/review対象として扱い、今回のカテゴリ別正式候補には入れない。

## カテゴリ別絞り込みの実装案

## 短期案: 静的マッピング

schema変更せず、作業カテゴリkeyから PartNameMaster.key のリストへ変換する静的マッピングを持つ。

配置候補。

```txt
src/lib/repair-work-target-part-options.ts
```

RepairEntryFormに直接大きな定数を置くより、lib側に分離した方が読みやすい。

例。

```ts
export const INTERNAL_TARGET_PART_KEYS_BY_WORK_CATEGORY_KEY = {
  power_winding: [
    "mainspring",
    "barrel",
    "barrel_arbor",
    "barrel_complete",
    "ratchet_wheel",
    "crown_wheel",
    "click",
    "click_spring",
    "ratchet_wheel_screw",
    "crown_wheel_screw",
    "crown_wheel_washer",
    "first_wheel_bridge",
    "first_wheel_bridge_screw",
  ],
  train_wheel: [
    "center_wheel",
    "third_wheel",
    "fourth_wheel",
    "seconds_pinion",
    "intermediate_wheel",
    "driving_wheel",
    "train_wheel_bridge",
    "center_wheel_bridge",
  ],
  escapement: [
    "pallet_fork",
    "escape_wheel",
    "pallet_stone",
    "pallet_bridge",
    "pallet_staff",
  ],
  regulator: [
    "balance_wheel",
    "balance_complete",
    "balance_staff",
    "hairspring",
    "roller_jewel",
    "roller_table",
    "regulator",
  ],
  hand_setting: [
    "stem",
    "setting_lever",
    "setting_lever_jumper",
    "setting_lever_jumper_screw",
    "yoke",
    "yoke_spring",
    "sliding_pinion",
    "winding_pinion",
  ],
  calendar: [
    "date_wheel",
    "day_wheel",
    "date_driving_wheel",
    "date_jumper",
    "weekday_driving_wheel",
    "weekday_jumper",
    "calendar_plate",
    "calendar_plate_screw",
    "corrector_wheel",
  ],
  automatic_winding: [
    "rotor",
    "rotor_staff",
    "rotor_staff_screw",
    "automatic_bridge",
    "reversing_wheel",
    "winding_wheel",
    "reduction_wheel",
    "ball_bearing",
    "pawl_lever",
  ],
  chronograph: [
    "chronograph_wheel",
    "chronograph_seconds_wheel",
    "minute_recorder_wheel",
    "hour_recorder_wheel",
    "reset_hammer",
    "heart_cam",
    "clutch_lever",
    "column_wheel",
    "cam",
  ],
  quartz: [
    "circuit_block",
    "coil",
    "stator",
    "step_rotor",
    "battery",
    "battery_clamp",
    "battery_clamp_screw",
    "contact_spring",
    "insulating_sheet",
    "circuit_spacer",
    "capacitor",
    "fifth_wheel_quartz",
  ],
  main_plate: [
    "main_plate",
    "dial_screw",
    "movement_case_screw",
    "center_pipe",
  ],
} as const;
```

`movement` は広すぎるため、初期はマッピングなしにして全件fallback、または主要カテゴリを跨ぐ候補だけに限定する。次実装では「マッピングなしカテゴリは全件fallback」とする方が入力をブロックしにくい。

短期案のメリット。

```txt
schema変更不要
DB操作不要
既存保存処理に影響しない
PartsMaster検索に触れない
カテゴリ変更時のUIだけに閉じられる
後からDB中間テーブルへ移行しやすい
```

短期案のデメリット。

```txt
カテゴリと部品の対応がコード定数になる
seed変更時にマッピング更新が必要
管理画面から対応関係を調整できない
```

## 中期案: DB中間テーブル

将来的には以下の中間テーブルを作る案がある。

```txt
RepairWorkCategoryTargetPart
- id
- repairWorkCategoryId
- partNameMasterId
- sortOrder
- isActive
- createdAt
- updatedAt
```

想定unique。

```txt
@@unique([repairWorkCategoryId, partNameMasterId])
@@index([repairWorkCategoryId, sortOrder])
@@index([partNameMasterId])
```

必要になる理由。

```txt
カテゴリ別候補をDB seedで管理できる
作業カテゴリと部品カテゴリが1対1でない問題を吸収できる
movement のような横断カテゴリにも個別候補を持てる
旧候補/review候補をisActiveで制御しやすい
外装作業カテゴリ設計後にも共通利用できる
```

影響範囲。

```txt
schema追加
migration整理
seed追加
master-actionsの取得関数追加または拡張
RepairEntryFormの候補取得/絞り込み変更
```

今すぐ導入するにはまだ早い理由。

```txt
外装作業カテゴリが未設計
カテゴリ別対象部品対応表の正式レビューがまだない
静的マッピングでUI挙動を先に確認できる
既存RepairLineItem保存構造はすでに受け皿がある
```

## 推奨案

次実装Taskでは、短期案を採用する。

```txt
schema変更なし
seed変更なし
DB操作なし
RepairEntryFormまたはlib側の静的マッピングで対象部品候補を絞る
既存 getInternalPartNameMasters() はそのまま全件取得に使う
PartsMaster検索・交換部品行は変更しない
```

推奨配置。

```txt
src/lib/repair-work-target-part-options.ts
```

このファイルに以下を置く。

```txt
INTERNAL_TARGET_PART_KEYS_BY_WORK_CATEGORY_KEY
filterTargetPartOptionsByWorkCategory(...)
```

RepairEntryForm側では、選択中の `newWorkCategoryId` から `repairWorkCategoryOptions` の `key` を引き、`workTargetPartOptions` を絞った `filteredWorkTargetPartOptions` を `useMemo` で作る。

## UI仕様案

### 1. 作業カテゴリ未選択時

推奨。

```txt
対象部品selectは無効化せず、全件表示ではなく「先に作業カテゴリを選択してください」を先頭表示する。
```

ただし、既存データや一時入力を壊さないため、以下の例外を設ける。

```txt
既に newTargetPartNameId が入っている場合は、その選択肢だけは表示維持する。
カテゴリが未選択で既存targetがある編集データは、保存時に勝手に消さない。
```

実装負荷をさらに下げたい場合は、初回だけ全件表示を維持し、カテゴリ選択後に絞り込み開始でもよい。ただし候補過多の課題解消を優先するなら、カテゴリ先行を促す方がよい。

### 2. 作業カテゴリ選択時

```txt
対応する対象部品だけ表示する。
候補順は getInternalPartNameMasters() の sortOrder順を維持する。
```

マッピングに含まれるkeyが現在の候補配列に存在しない場合は無視する。

### 3. 作業カテゴリ変更時

```txt
既に選択済みの targetPartNameId が新カテゴリ候補内にあれば保持。
候補外なら targetPartNameId と targetPartNameSnapshot をクリア。
```

クリアする理由。

```txt
作業カテゴリと対象部品の不整合を避けるため。
例: カレンダー選択後に対象部品=ゼンマイが残るのを避ける。
```

ただし、マッピングが存在しないカテゴリでは全件fallbackにするため、現在値は保持できる。

### 4. 対象部品候補がない場合

推奨。

```txt
マッピング未定義カテゴリ: 全件fallback
マッピング定義済みだが該当0件: 「該当候補なし」を表示し、対象部品は未選択にする
```

自由入力は許可しない。

理由。

```txt
targetPartNameId は PartNameMaster 参照であり、自由入力を混ぜると構造化・検索・集計が崩れる。
候補不足は別TaskでPartNameMasterまたはマッピングのreviewとして扱う。
```

## カテゴリ変更時の targetPartNameId 保持/クリア方針

次実装の具体方針。

```txt
1. newWorkCategoryId変更
2. 選択カテゴリkeyを取得
3. filteredWorkTargetPartOptionsを算出
4. 現在のnewTargetPartNameIdが空なら何もしない
5. 現在のnewTargetPartNameIdがfiltered候補内にあれば保持
6. 候補外なら newTargetPartNameId / newTargetPartNameSnapshot をクリア
```

PART行には適用しない。LABOR行の新規追加フォームだけの挙動とする。

## fallback方針

```txt
カテゴリ未選択
→ 基本はカテゴリ選択を促す。
→ 既存targetがある場合のみ現在値表示を維持。

カテゴリにマッピングなし
→ 全件fallback。

カテゴリにマッピングあり、該当候補あり
→ 絞り込み表示。

カテゴリにマッピングあり、該当候補なし
→ 該当候補なし。
→ 自由入力はしない。
```

## 変更してはいけないもの

次実装Taskでも、明示されない限り以下は変更しない。

```txt
schema
migration
seed
DB
RepairLineItem保存仕様
EstimateItem表示仕様
PricingRule検索条件
PricingRule.suggestedWorkName
PartsMaster検索ロジック
getPartsMatched
PartsSearchPanel
partsMasterIdの扱い
交換部品行の動作
部品パネルの検索仕様
帳票
PDF
LINE
共有ページ
PublicCase
LABOR/PART行の1行集約表示
```

## 次Task案

```txt
Task 108-10L:
RepairEntryForm の構造化作業入力で、作業カテゴリに応じて targetPartNameId 候補を静的マッピングで絞り込む。

実装範囲:
- src/lib/repair-work-target-part-options.ts 追加
- RepairEntryForm の対象部品select候補を filteredWorkTargetPartOptions に変更
- カテゴリ変更時、候補外 targetPartNameId をクリア

禁止:
- schema変更
- seed変更
- PartsMaster検索変更
- getPartsMatched変更
- PartsSearchPanel変更
- 保存処理変更
```

中期Task案。

```txt
Task 108-11以降:
静的マッピングで実務確認後、RepairWorkCategoryTargetPart 中間テーブル化が必要か判断する。
```

## 未確認点

```txt
movement カテゴリの対象部品を限定するか、当面全件fallbackにするか。
train_wheel 側の旧 fifth_wheel をUI候補から完全に除外するか、旧候補として残すか。
カテゴリ別マッピングの正式レビュー。
外装カテゴリ設計後、同じ仕組みを external に拡張するか。
候補不足時のreview導線をどこに置くか。
```

