# Task 108-10P: 作業カテゴリに応じた対象部品候補絞り込みを確定リスト準拠で再実装

## 目的

RepairEntryForm の構造化作業入力で、LABOR行（技術料行）の `targetPartNameId（作業対象部品名ID）` 候補を、選択した `RepairWorkCategory（修理作業カテゴリ）` に応じて絞り込む。

今回の対象は `targetPartNameId` の候補表示のみであり、PART行（交換部品行）の `partsMasterId`、PartsMaster検索、部品パネルは変更しない。

## 前提commit

```txt
0a30b83 feat: seed movement part and additional repair actions
```

## 変更ファイル

```txt
src/lib/repair-work-target-part-filter.ts
src/components/repairs/RepairEntryForm.tsx
docs/ai-tasks/108-10P-implement-target-part-filter-confirmed-list.md
```

## 確定リスト準拠の方針

確定リストにある部品名のうち、現行 `PartNameMaster` seedに存在するkeyだけを静的mappingへ入れた。

以下はしない。

```txt
PartNameMaster seed追加
推測による候補追加
カテゴリ選択済み時の全件fallback
候補0件時の全件fallback
```

## 追加した静的マッピング

`src/lib/repair-work-target-part-filter.ts` を追加し、`RepairWorkCategory.name` のkeyから `PartNameMaster.key` の一覧を返すようにした。

```txt
RepairWorkCategory.name
→ PartNameMaster.key[]
```

## カテゴリごとのmapping内容

### movement / ムーブメント

```txt
movement
```

### quartz / クォーツ

```txt
battery
capacitor
battery_clamp
battery_clamp_screw
contact_spring
insulating_sheet
circuit_block
coil
stator
step_rotor
circuit_spacer
fifth_wheel_quartz
```

`五番車` は `fifth_wheel_quartz` のみを採用し、機械式輪列カテゴリには入れていない。

### power_winding / 動力・巻上

```txt
mainspring
barrel
barrel_arbor
barrel_complete
ratchet_wheel
crown_wheel
click
click_spring
ratchet_wheel_screw
crown_wheel_screw
crown_wheel_washer
first_wheel_bridge
first_wheel_bridge_screw
```

### train_wheel / 輪列

```txt
center_wheel
third_wheel
fourth_wheel
seconds_pinion
intermediate_wheel
driving_wheel
train_wheel_bridge
center_wheel_bridge
train_wheel_bridge_screw
center_wheel_bridge_screw
center_wheel_hole_jewel_upper
center_wheel_hole_jewel_lower
third_wheel_hole_jewel_upper
third_wheel_hole_jewel_lower
fourth_wheel_hole_jewel_upper
fourth_wheel_hole_jewel_lower
```

`fifth_wheel` と `fifth_wheel_hole_jewel_*` は入れていない。

### escapement / 脱進機

```txt
pallet_fork
pallet_bridge
pallet_staff
escape_wheel
pallet_stone
escape_wheel_hole_jewel_upper
escape_wheel_hole_jewel_lower
escape_wheel_cap_jewel_upper
escape_wheel_cap_jewel_lower
pallet_hole_jewel_upper
pallet_hole_jewel_lower
pallet_cap_jewel_upper
pallet_cap_jewel_lower
escape_wheel_shock_hole_jewel_upper
escape_wheel_shock_hole_jewel_lower
escape_wheel_shock_cap_jewel_upper
escape_wheel_shock_cap_jewel_lower
escape_wheel_shock_spring_upper
escape_wheel_shock_spring_lower
pallet_shock_hole_jewel_upper
pallet_shock_hole_jewel_lower
pallet_shock_cap_jewel_upper
pallet_shock_cap_jewel_lower
pallet_shock_spring_upper
pallet_shock_spring_lower
```

### regulator / 調速機

```txt
balance_wheel
balance_complete
balance_staff
hairspring
roller_jewel
roller_table
regulator
hairspring_collet
balance_rim
hairspring_stud
hairspring_stud_screw
balance_hole_jewel_upper
balance_hole_jewel_lower
balance_cap_jewel_upper
balance_cap_jewel_lower
balance_shock_hole_jewel_setting_upper
balance_shock_hole_jewel_setting_lower
balance_shock_hole_jewel_upper
balance_shock_hole_jewel_lower
balance_shock_cap_jewel_upper
balance_shock_cap_jewel_lower
balance_shock_spring_upper
balance_shock_spring_lower
balance_shock_complete_upper
balance_shock_complete_lower
```

### hand_setting / 針回し

```txt
stem_internal
sliding_pinion
winding_pinion
setting_wheel_keyless
minute_wheel_keyless
setting_lever
yoke
yoke_spring
setting_lever_jumper
setting_lever_jumper_screw
setting_lever_screw
setting_lever_pin
cannon_pinion_keyless
hour_wheel
minute_work_cover
minute_work_cover_screw
minute_wheel_bridge
```

`カンヌキ押さえ`、`カンヌキ押さえネジ` はalias候補であり、正式部品名として増やしていない。

### calendar / カレンダー

```txt
date_wheel
day_wheel
date_driving_wheel
weekday_driving_wheel
date_jumper
weekday_jumper
calendar_plate
corrector_wheel
intermediate_date_wheel
corrector_intermediate_wheel
calendar_plate_screw
```

### automatic_winding / 自動巻

```txt
rotor
rotor_staff
rotor_staff_screw
automatic_bridge
reversing_wheel
winding_wheel
reduction_wheel
ball_bearing
pawl_lever
automatic_bridge_screw
```

`自動巻機構一式` は入れていない。

### chronograph / クロノグラフ

```txt
chronograph_wheel
chronograph_seconds_wheel
minute_recorder_wheel
hour_recorder_wheel
reset_hammer
heart_cam
clutch_lever
column_wheel
cam
```

不採用候補は入れていない。

### main_plate / 地板

```txt
main_plate
dial_screw
movement_case_screw
center_pipe
```

`movement / ムーブメント` は地板カテゴリに入れていない。

## 未seedでmappingに入れなかった候補

確定リストにあるが、現行seedにkeyがないためmappingへ入れていないもの。

```txt
秒カナ受け
秒カナ押さえ
ネジ穴
受け座
二次電池（キャパシタとは別名としては未seed）
```

以下は現行seedで上/下などに分かれているため、対応する既存keyをmappingに入れた。

```txt
二番穴石
三番穴石
四番穴石
ガンギ穴石
ガンギ受石
アンクル穴石
アンクル受石
耐震穴石座
耐震穴石
耐震受石
耐震バネ
耐震軸受け
```

## movement（ムーブメント）カテゴリの扱い

`movement` カテゴリを選択した場合、対象部品候補は `movement / ムーブメント` だけにする。

以下はしない。

```txt
他の内装部品全件fallback
main_plate / 地板配下として扱う
ムーブメント一式の追加
```

## 全件fallback禁止の実装内容

RepairEntryFormでは以下の挙動にした。

```txt
カテゴリ未選択
→ 対象部品候補は全件表示

カテゴリ選択済み + mappingあり
→ mapping内だけ表示

カテゴリ選択済み + mappingなし
→ 空候補。全件表示しない
```

## 候補0件fallback禁止の実装内容

mappingが存在しても、DBから取得した `PartNameMaster` に該当keyが存在しない場合は空候補のままにする。全件fallbackはしない。

補足表示:

```txt
対象部品候補が未設定です
```

## カテゴリ変更時のtargetPartNameIdクリア仕様

カテゴリ変更時、現在の `targetPartNameId` が新カテゴリの候補内にあるか確認する。

```txt
候補内にある
→ targetPartNameId / targetPartNameSnapshot を保持

候補外
→ targetPartNameId / targetPartNameSnapshot をクリア

mappingなし
→ targetPartNameId / targetPartNameSnapshot をクリア
```

## targetPartNameId と partsMasterId を混同していないこと

今回変更したのはLABOR行の `targetPartNameId` 候補だけである。

以下は変更していない。

```txt
partsMasterId
PartsMaster検索
getPartsMatched
PartsSearchPanel
交換部品行
部品パネル
```

## 変更していないもの

```txt
schema
migration
seed
DB構造
API
PricingRule
PartsMaster検索
getPartsMatched
PartsSearchPanel
帳票
PDF
LINE
共有ページ
PublicCase
Caliber
Brand
Model
```

## 検証結果

以下を実行し、成功した。

```powershell
npx prisma validate
# success

npx prisma generate
# success

npx tsc --noEmit --pretty false --incremental false
# success
```

dev serverでの画面確認は未実施。

## 未確認点

- dev server上でカテゴリごとの対象部品selectを実画面確認すること。
- 未seed候補を今後 PartNameMaster に追加するか。

## 次Task候補

```txt
Task 108-10Q:
未seed候補を正式追加するか確認し、必要なら PartNameMaster seed差分を設計する。
```
