AI Task 008 指示書・作り直し版
# AI Task 008: 部品カテゴリ・部品名候補の定義ファイルを作る

## 目的

交換部品入力フローで使う、内装 / 外装、部品カテゴリ、部品名候補の定義ファイルを作る。

今回の目的は、UI実装の前に選択肢データの土台を作ること。

まだ以下は実装しない。

- RepairEntryForm へのUI追加
- 交換部品入力欄クリック時の補助UI表示
- PartsSearchPanel への初期検索条件渡し
- PartsMaster検索ロジック変更
- 外部検索導線追加
- API変更
- DB変更

## ブランチ

feature/create-part-input-options-definition

## 触ってよい範囲

- `src/lib/part-input-options.ts`
- `docs/ai-tasks/008-create-part-input-options-definition.md`

## 触ってはいけない範囲

- `src/components/repairs/RepairEntryForm.tsx`
- `src/components/parts/PartsSearchPanel.tsx`
- `src/components/parts/PartsForm.tsx`
- `src/lib/part-search.ts`
- `src/lib/parts-master.ts`
- `src/app/api/*`
- `prisma/schema.prisma`
- API routes
- DB schema
- 保存ロジック
- 検索ロジック本体
- UI実装

## 前提

AI Task 007 の調査で、以下が分かっている。

- 交換部品判定は主に `item.category.includes('part')` を使っている。
- `internal` は技術料系と衝突する可能性がある。
- 内装部品 / 外装部品を表す値は、`part_internal` / `part_external` が安全。
- 部品カテゴリは、部品名を絞り込むためだけに使う。
- 部品カテゴリに英語名は不要。
- 部品名には日本語名と英語名が必要。
- 入力は選択式を前提とするため、今回 `aliasesJa` / `aliasesEn` は入れない。
- 検索用の別名・同義語は、将来 `part-search.ts` 側または別の検索用定義として扱う。
- 将来的にはDBマスタ化できる形が望ましいが、今回はコード内定義でよい。

## 実装要件

`src/lib/part-input-options.ts` を新規作成する。

このファイルに、以下を定義する。

### 1. PartInputType

```ts
export type PartInputType = "part_internal" | "part_external";
2. HandPosition

針の位置を表す。

export type HandPosition =
  | "center"
  | "1H"
  | "2H"
  | "3H"
  | "4H"
  | "5H"
  | "6H"
  | "7H"
  | "8H"
  | "9H"
  | "10H"
  | "11H"
  | "12H";
3. MovementPartPosition

内装部品の上下位置を表す。

export type MovementPartPosition = "upper" | "lower";
4. MovementPartTarget

内装部品の対象部位を表す。

export type MovementPartTarget =
  | "barrel"
  | "center_wheel"
  | "third_wheel"
  | "fourth_wheel"
  | "fifth_wheel"
  | "escape_wheel"
  | "pallet"
  | "balance";
5. PartCategoryOption
export type PartCategoryOption = {
  key: string;
  partType: PartInputType;
  labelJa: string;
};
6. PartNameOption
export type PartNameOption = {
  key: string;
  partType: PartInputType;
  categoryKey: string;
  nameJa: string;
  nameEn: string;
  displayJa?: string;
  displayEn?: string;
  handPosition?: HandPosition;
  movementTarget?: MovementPartTarget;
  movementPosition?: MovementPartPosition;
};

注意：

aliasesJa / aliasesEn は今回入れない。
displayJa は、針や上下位置など、UI表示名を nameJa と分けたい場合に使う。
例：nameJa: "秒針", displayJa: "秒針・6H"
例：nameJa: "テンプ耐震穴石", displayJa: "テンプ耐震穴石（上）"
7. PART_INPUT_TYPES
export const PART_INPUT_TYPES = [
  { value: "part_external", labelJa: "外装部品" },
  { value: "part_internal", labelJa: "内装部品" },
] as const;
8. PART_CATEGORIES

外装・内装の部品カテゴリを定義する。

9. PART_NAME_OPTIONS

カテゴリごとの部品名候補を定義する。

10. helper関数

UI実装で使いやすいように、以下のhelper関数を作る。

export function getPartCategoriesByType(partType: PartInputType): PartCategoryOption[]
export function getPartNamesByCategory(categoryKey: string): PartNameOption[]
export function getPartNameOptionByKey(key: string): PartNameOption | undefined
export function searchPartNameOptions(keyword: string, partType?: PartInputType): PartNameOption[]

検索対象は最低限以下。

nameJa
nameEn
displayJa
displayEn

aliasesJa / aliasesEn は今回存在しない前提。

外装カテゴリ

外装カテゴリは「時計の箇所」で選ぶ。

以下を初期カテゴリとして定義する。

key	表示名
case_glass	ケース・風防
crown_tube	リューズ・チューブ
pushers	プッシャー
bezel	ベゼル
dial_hands	文字盤・針
bracelet_band	ブレス・バンド

すべて partType: "part_external" とする。

注意：

gasket_screws_pins のような独立カテゴリは作らない。
パッキン、ネジ、ピンは該当する時計箇所カテゴリに入れる。
bezel_pushers は使わない。ベゼルとプッシャーは分ける。
外装部品名候補
ケース・風防: case_glass
key	日本語	英語
case	ケース	Case
case_back	裏蓋	Case back
acrylic_crystal	風防	Acrylic crystal
tension_ring_acrylic_crystal	風防（テンションリング）	Tension ring acrylic crystal
mineral_crystal	ガラス	Mineral crystal
sapphire_crystal	サファイアガラス	Sapphire crystal
crystal_gasket	ガラスパッキン	Crystal gasket
crystal_plastic_gasket	ガラスプラパッキン	Plastic crystal gasket
case_back_gasket	裏蓋パッキン	Case back gasket
case_back_plastic_gasket	裏蓋プラパッキン	Plastic case back gasket
case_screw	ケースネジ	Case screw
case_back_screw	裏蓋ネジ	Case back screw
case_pin	ケースピン	Case pin
other_case_part	その他ケース部品	Other case part

注意：

風防 = プラスチック風防として扱う。
ガラス = ミネラルガラスとして扱う。
ミネラルガラス は独立候補にしない。
別名は今回入れない。
リューズ・チューブ: crown_tube
key	日本語	英語
crown	リューズ	Crown
screw_down_crown	リューズ（ねじ込み）	Screw-down crown
crown_tube	チューブ	Crown tube
crown_side_threaded_tube	チューブ（リューズ側ねじ）	Crown-side threaded tube
case_side_threaded_tube	チューブ（ケース側ねじ）	Case-side threaded tube
double_threaded_crown_tube	チューブ（ケース側ねじ・リューズ側ねじ）	Double threaded crown tube
crown_gasket	リューズパッキン	Crown gasket
crown_tube_gasket	チューブパッキン	Crown tube gasket

注意：

チューブは形状が異なるため、形状違いを別候補として定義する。
プッシャー: pushers
key	日本語	英語
pusher	プッシャー	Pusher
pusher_gasket	プッシャーパッキン	Pusher gasket
pusher_tube	プッシャーチューブ	Pusher tube
pusher_spring	プッシャースプリング	Pusher spring
pusher_screw	プッシャーネジ	Pusher screw
pusher_pin	プッシャーピン	Pusher pin
ベゼル: bezel
key	日本語	英語
bezel	ベゼル	Bezel
bezel_insert	ベゼルインサート	Bezel insert
rotating_bezel	回転ベゼル	Rotating bezel
bezel_gasket	ベゼルパッキン	Bezel gasket
bezel_spring	ベゼルスプリング	Bezel spring
bezel_screw	ベゼルネジ	Bezel screw
bezel_pin	ベゼルピン	Bezel pin
luminous_pip	ルミナスポイント	Luminous pip
文字盤・針: dial_hands
key	日本語	英語
dial	文字盤	Dial
index	インデックス	Index
lume	蓄光	Lume

針は、役割と位置を分けて持つ。

通常の表示は displayJa / displayEn を使う。

例：

{
  key: "hour_hand_center",
  partType: "part_external",
  categoryKey: "dial_hands",
  nameJa: "時針",
  nameEn: "Hour hand",
  displayJa: "時針・センター",
  displayEn: "Center hour hand",
  handPosition: "center",
}

初期候補として以下を定義する。

key	nameJa	nameEn	displayJa	displayEn	handPosition
hour_hand_center	時針	Hour hand	時針・センター	Center hour hand	center
minute_hand_center	分針	Minute hand	分針・センター	Center minute hand	center
second_hand_center	秒針	Second hand	秒針・センター	Center second hand	center
hand_set_center	針セット	Hand set	針セット・センター	Center hand set	center
hour_hand_6h	時針	Hour hand	時針・6H	6H hour hand	6H
minute_hand_6h	分針	Minute hand	分針・6H	6H minute hand	6H
second_hand_6h	秒針	Second hand	秒針・6H	6H second hand	6H
chronograph_second_hand_center	クロノ秒針	Chronograph seconds hand	クロノ秒針・センター	Center chronograph seconds hand	center
minute_recorder_hand_3h	分積算針	Minute recorder hand	分積算針・3H	3H minute recorder hand	3H
minute_recorder_hand_6h	分積算針	Minute recorder hand	分積算針・6H	6H minute recorder hand	6H
minute_recorder_hand_9h	分積算針	Minute recorder hand	分積算針・9H	9H minute recorder hand	9H
hour_recorder_hand_3h	時積算針	Hour recorder hand	時積算針・3H	3H hour recorder hand	3H
hour_recorder_hand_6h	時積算針	Hour recorder hand	時積算針・6H	6H hour recorder hand	6H
hour_recorder_hand_9h	時積算針	Hour recorder hand	時積算針・9H	9H hour recorder hand	9H
twenty_four_hour_hand_center	24時間針	24-hour hand	24時間針・センター	Center 24-hour hand	center
twenty_four_hour_hand_6h	24時間針	24-hour hand	24時間針・6H	6H 24-hour hand	6H
gmt_hand_center	GMT針	GMT hand	GMT針・センター	Center GMT hand	center
pointer_hand_3h	指示針	Pointer hand	指示針・3H	3H pointer hand	3H
pointer_hand_6h	指示針	Pointer hand	指示針・6H	6H pointer hand	6H
pointer_hand_9h	指示針	Pointer hand	指示針・9H	9H pointer hand	9H
pointer_hand_12h	指示針	Pointer hand	指示針・12H	12H pointer hand	12H
ブレス・バンド: bracelet_band
key	日本語	英語
bracelet	ブレスレット	Bracelet
strap	バンド	Strap
link	コマ	Link
clasp	クラスプ	Clasp
buckle	バックル	Buckle
spring_bar	バネ棒	Spring bar
end_link	エンドリンク	End link
flush_fit	フラッシュフィット	Flush fit
bracelet_pin	ピン	Pin
c_clip	Cリング	C-clip
screw_pin	ネジピン	Screw pin
clasp_screw	クラスプネジ	Clasp screw
clasp_spring	クラスプバネ	Clasp spring
内装カテゴリ

以下を初期カテゴリとして定義する。

key	表示名
mainspring_barrel	動力・巻上
train_wheel	輪列
escapement	脱進機
balance	調速機
keyless_works	針回し
calendar	カレンダー
automatic_winding	自動巻
chronograph	クロノグラフ
quartz	クォーツ
main_plate	地板

すべて partType: "part_internal" とする。

内装部品名候補
動力・巻上: mainspring_barrel
key	日本語	英語
mainspring	ゼンマイ	Mainspring
barrel	香箱	Barrel
barrel_arbor	香箱真	Barrel arbor
barrel_complete	香箱一式（ゼンマイ込み）	Barrel complete
ratchet_wheel	角穴車	Ratchet wheel
crown_wheel	丸穴車	Crown wheel
click	コハゼ	Click
click_spring	コハゼバネ	Click spring
ratchet_wheel_screw	角穴ネジ	Ratchet wheel screw
crown_wheel_screw	丸穴ネジ	Crown wheel screw
crown_wheel_washer	丸穴座	Crown wheel washer
barrel_bushing_upper	ブッシュ（香箱）上	Upper barrel bushing
barrel_bushing_lower	ブッシュ（香箱）下	Lower barrel bushing
barrel_hole_jewel_upper	穴石（香箱）上	Upper barrel hole jewel
barrel_hole_jewel_lower	穴石（香箱）下	Lower barrel hole jewel
first_wheel_bridge	一番受け	First wheel bridge
first_wheel_bridge_screw	一番受けネジ	First wheel bridge screw
輪列: train_wheel
key	日本語	英語
center_wheel	二番車	Center wheel
third_wheel	三番車	Third wheel
fourth_wheel	四番車	Fourth wheel
fifth_wheel	五番車	Fifth wheel
seconds_pinion	秒カナ	Seconds pinion
intermediate_wheel	伝え車	Intermediate wheel
driving_wheel	出車	Driving wheel
train_wheel_bridge	輪列受	Train wheel bridge
center_wheel_bridge	二番受け	Center wheel bridge
train_wheel_bridge_screw	輪列受けネジ	Train wheel bridge screw
center_wheel_bridge_screw	二番受けネジ	Center wheel bridge screw
stop_lever	規制レバー	Stop lever
center_wheel_hole_jewel_upper	二番穴石（上）	Upper center wheel hole jewel
center_wheel_hole_jewel_lower	二番穴石（下）	Lower center wheel hole jewel
third_wheel_hole_jewel_upper	三番穴石（上）	Upper third wheel hole jewel
third_wheel_hole_jewel_lower	三番穴石（下）	Lower third wheel hole jewel
fourth_wheel_hole_jewel_upper	四番穴石（上）	Upper fourth wheel hole jewel
fourth_wheel_hole_jewel_lower	四番穴石（下）	Lower fourth wheel hole jewel
fifth_wheel_hole_jewel_upper	五番穴石（上）	Upper fifth wheel hole jewel
fifth_wheel_hole_jewel_lower	五番穴石（下）	Lower fifth wheel hole jewel

通常の穴石は、地板や受けに圧入固定される通常軸受として扱う。
耐震装置付きの耐震穴石とは別部品として定義する。

脱進機: escapement
key	日本語	英語
pallet_fork	アンクル	Pallet fork
escape_wheel	ガンギ車	Escape wheel
pallet_stone	爪石	Pallet stone
pallet_bridge	アンクル受	Pallet bridge
pallet_staff	アンクル真	Pallet staff
pallet_bridge_screw	アンクル受けネジ	Pallet bridge screw
escape_wheel_hole_jewel_upper	ガンギ穴石（上）	Upper escape wheel hole jewel
escape_wheel_hole_jewel_lower	ガンギ穴石（下）	Lower escape wheel hole jewel
pallet_hole_jewel_upper	アンクル穴石（上）	Upper pallet hole jewel
pallet_hole_jewel_lower	アンクル穴石（下）	Lower pallet hole jewel
pallet_cap_jewel_upper	アンクル受石（上）	Upper pallet cap jewel
pallet_cap_jewel_lower	アンクル受石（下）	Lower pallet cap jewel
escape_wheel_cap_jewel_upper	ガンギ受石（上）	Upper escape wheel cap jewel
escape_wheel_cap_jewel_lower	ガンギ受石（下）	Lower escape wheel cap jewel

アンクル耐震系：

key	日本語	英語
pallet_shock_hole_jewel_setting_upper	アンクル耐震穴石座（上）	Upper pallet shock hole jewel setting
pallet_shock_hole_jewel_setting_lower	アンクル耐震穴石座（下）	Lower pallet shock hole jewel setting
pallet_shock_hole_jewel_upper	アンクル耐震穴石（上）	Upper pallet shock hole jewel
pallet_shock_hole_jewel_lower	アンクル耐震穴石（下）	Lower pallet shock hole jewel
pallet_shock_cap_jewel_upper	アンクル耐震受石（上）	Upper pallet shock cap jewel
pallet_shock_cap_jewel_lower	アンクル耐震受石（下）	Lower pallet shock cap jewel
pallet_shock_spring_upper	アンクル耐震バネ（上）	Upper pallet shock spring
pallet_shock_spring_lower	アンクル耐震バネ（下）	Lower pallet shock spring
pallet_shock_complete_upper	アンクル耐震軸受け（一体・上）	Upper pallet shock complete
pallet_shock_complete_lower	アンクル耐震軸受け（一体・下）	Lower pallet shock complete

ガンギ耐震系：

key	日本語	英語
escape_wheel_shock_hole_jewel_setting_upper	ガンギ耐震穴石座（上）	Upper escape wheel shock hole jewel setting
escape_wheel_shock_hole_jewel_setting_lower	ガンギ耐震穴石座（下）	Lower escape wheel shock hole jewel setting
escape_wheel_shock_hole_jewel_upper	ガンギ耐震穴石（上）	Upper escape wheel shock hole jewel
escape_wheel_shock_hole_jewel_lower	ガンギ耐震穴石（下）	Lower escape wheel shock hole jewel
escape_wheel_shock_cap_jewel_upper	ガンギ耐震受石（上）	Upper escape wheel shock cap jewel
escape_wheel_shock_cap_jewel_lower	ガンギ耐震受石（下）	Lower escape wheel shock cap jewel
escape_wheel_shock_spring_upper	ガンギ耐震バネ（上）	Upper escape wheel shock spring
escape_wheel_shock_spring_lower	ガンギ耐震バネ（下）	Lower escape wheel shock spring
escape_wheel_shock_complete_upper	ガンギ耐震軸受け（一体・上）	Upper escape wheel shock complete
escape_wheel_shock_complete_lower	ガンギ耐震軸受け（一体・下）	Lower escape wheel shock complete

注意：

普通の穴石・受石と、耐震穴石・耐震受石は別部品として扱う。
普通の穴石は地板や受けに圧入固定される。
耐震穴石は耐震装置内でバネ固定される。
alias扱いにしない。
調速機: balance
key	日本語	英語
balance_wheel	テンプ	Balance wheel
balance_complete	テンプ一式	Balance complete
balance_staff	天真	Balance staff
hairspring	ヒゲゼンマイ	Hairspring
roller_jewel	振り石	Roller jewel
roller_table	振座	Roller table
regulator	緩急針	Regulator
hairspring_collet	ヒゲ栓	Hairspring collet
balance_rim	テン輪	Balance rim
hairspring_stud	ヒゲ持ち	Hairspring stud
hairspring_stud_screw	ヒゲ持ちネジ	Hairspring stud screw
balance_hole_jewel_upper	テンプ穴石（上）	Upper balance hole jewel
balance_hole_jewel_lower	テンプ穴石（下）	Lower balance hole jewel
balance_cap_jewel_upper	テンプ受石（上）	Upper balance cap jewel
balance_cap_jewel_lower	テンプ受石（下）	Lower balance cap jewel

テンプ耐震系：

key	日本語	英語
balance_shock_hole_jewel_setting_upper	テンプ耐震穴石座（上）	Upper balance shock hole jewel setting
balance_shock_hole_jewel_setting_lower	テンプ耐震穴石座（下）	Lower balance shock hole jewel setting
balance_shock_hole_jewel_upper	テンプ耐震穴石（上）	Upper balance shock hole jewel
balance_shock_hole_jewel_lower	テンプ耐震穴石（下）	Lower balance shock hole jewel
balance_shock_cap_jewel_upper	テンプ耐震受石（上）	Upper balance shock cap jewel
balance_shock_cap_jewel_lower	テンプ耐震受石（下）	Lower balance shock cap jewel
balance_shock_spring_upper	テンプ耐震バネ（上）	Upper balance shock spring
balance_shock_spring_lower	テンプ耐震バネ（下）	Lower balance shock spring
balance_shock_complete_upper	テンプ耐震軸受け（一体・上）	Upper balance shock complete
balance_shock_complete_lower	テンプ耐震軸受け（一体・下）	Lower balance shock complete
針回し: keyless_works
key	日本語	英語
stem_internal	巻真	Stem
sliding_pinion	ツヅミ車	Sliding pinion
winding_pinion	キチ車	Winding pinion
setting_wheel_keyless	小鉄車	Setting wheel
minute_wheel_keyless	日の裏車	Minute wheel
setting_lever	オシドリ	Setting lever
yoke	カンヌキ	Yoke
yoke_spring	カンヌキバネ	Yoke spring
setting_lever_jumper	裏押さえ	Setting lever jumper
intermediate_wheel_keyless	伝え車	Intermediate wheel
setting_lever_screw	オシドリネジ	Setting lever screw
setting_lever_pin	オシドリピン	Setting lever pin
cannon_pinion_keyless	筒カナ	Cannon pinion
hour_wheel	筒車	Hour wheel
minute_work_cover	日の裏押さえ	Minute work cover
minute_work_cover_screw	日の裏押さえネジ	Minute work cover screw
setting_lever_jumper_screw	裏押さえネジ	Setting lever jumper screw
minute_wheel_bridge	分車	Minute wheel bridge
カレンダー: calendar
key	日本語	英語
date_wheel	日板	Date wheel
day_wheel	曜板	Day wheel
date_driving_wheel	日送り車	Date driving wheel
date_jumper	日送り爪	Date jumper
calendar_plate	カレンダー押さえ	Calendar plate
corrector_wheel	修正車	Corrector wheel
intermediate_date_wheel	日送り中間車	Intermediate date wheel
corrector_intermediate_wheel	修正伝え車	Corrector intermediate wheel
calendar_plate_screw	カレンダー押さえネジ	Calendar plate screw
自動巻: automatic_winding
key	日本語	英語
rotor	ローター	Rotor
automatic_bridge	自動巻受	Automatic bridge
reversing_wheel	切替車	Reversing wheel
winding_wheel	巻上車	Winding wheel
reduction_wheel	減速車	Reduction wheel
ball_bearing	ボールベアリング	Ball bearing
pawl_lever	爪レバー	Pawl lever
automatic_bridge_screw	自動巻受ネジ	Automatic bridge screw
クロノグラフ: chronograph
key	日本語	英語
chronograph_wheel	クロノグラフ車	Chronograph wheel
chronograph_seconds_wheel	クロノ秒車	Chronograph seconds wheel
minute_recorder_wheel	分積算車	Minute recorder wheel
hour_recorder_wheel	時積算車	Hour recorder wheel
reset_hammer	リセットハンマー	Reset hammer
heart_cam	ハートカム	Heart cam
clutch_lever	クラッチレバー	Clutch lever
column_wheel	コラムホイール	Column wheel
cam	カム	Cam
クォーツ: quartz
key	日本語	英語
circuit_block	回路	Circuit block
coil	コイル	Coil
stator	ステーター	Stator
step_rotor	ステップローター	Step rotor
capacitor	キャパシタ	Capacitor
fifth_wheel_quartz	五番車	Fifth wheel
地板: main_plate
key	日本語	英語
main_plate	地板	Main plate
dial_screw	文字盤止めネジ	Dial screw
movement_case_screw	機止めネジ	Movement case screw
center_pipe	中心パイプ	Center pipe
movementTarget / movementPosition を付けるべきもの

以下には可能な範囲で movementTarget と movementPosition を付ける。

例：

balance_shock_hole_jewel_upper
movementTarget: "balance"
movementPosition: "upper"
pallet_shock_hole_jewel_lower
movementTarget: "pallet"
movementPosition: "lower"
escape_wheel_hole_jewel_upper
movementTarget: "escape_wheel"
movementPosition: "upper"

普通の穴石・受石にも対象部位と上下が明確なものは付ける。

実装上の注意
key は一意にすること。
同じ日本語名が複数カテゴリに出る場合は、keyを分けること。
aliasesJa / aliasesEn は今回使わない。
internal / external 単体を部品入力typeとして使わない。
part_internal / part_external を使う。
針は handPosition を使う。
内装の上下部品は movementPosition を使う。
内装の対象部位は movementTarget を使う。
今回はUIに接続しない。
今回はPartsMaster schemaに接続しない。
今回はDB保存しない。
完了条件
src/lib/part-input-options.ts が作成されている。
PartInputType が定義されている。
HandPosition が定義されている。
MovementPartPosition が定義されている。
MovementPartTarget が定義されている。
PartCategoryOption が定義されている。
PartNameOption が定義されている。
PART_INPUT_TYPES が定義されている。
PART_CATEGORIES が定義されている。
PART_NAME_OPTIONS が定義されている。
helper関数が定義されている。
key が重複していない。
part_internal / part_external を使っている。
internal / external 単体は部品入力typeとして使っていない。
RepairEntryForm.tsx は変更していない。
PartsSearchPanel.tsx は変更していない。
API routes は変更していない。
Prisma schema は変更していない。
UIは変更していない。
npx tsc --noEmit が通る。
git status --short で想定外の変更がない。
確認コマンド
npx tsc --noEmit
git status --short

必要ならkey重複確認も行う。

Codexへの指示

まず以下を確認してください。

docs/ai-tasks/007-investigate-part-input-flow.md
src/lib 配下の既存構成
tsconfig.json

そのうえで、src/lib/part-input-options.ts を新規作成してください。

今回は定義ファイルの作成だけです。

以下は禁止です。

RepairEntryForm.tsx の変更
PartsSearchPanel.tsx の変更
PartsForm.tsx の変更
part-search.ts の変更
API routes の変更
Prisma schema の変更
保存ロジックの変更
検索ロジック本体の変更
UI実装
DB変更
unrelated file の変更
ついでのリファクタリング

実装後、変更内容を最小限にまとめて報告してください。

Codexの返答形式

以下の形式で返してください。

実施内容
変更ファイル
定義した型
定義したカテゴリ
定義した部品名候補
helper関数
key重複確認
触っていない重要ファイル
確認コマンド
git status結果
未対応・注意点
カタリにレビューしてほしい点
Codex実装結果 2026-05-03

未記入。