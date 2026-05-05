export type PartInputType = "part_internal" | "part_external";

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

export type MovementPartPosition = "upper" | "lower";

export type MovementPartTarget =
    | "barrel"
    | "center_wheel"
    | "third_wheel"
    | "fourth_wheel"
    | "fifth_wheel"
    | "escape_wheel"
    | "pallet"
    | "balance";

export type PartCategoryOption = {
    key: string;
    partType: PartInputType;
    labelJa: string;
};

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

export const PART_INPUT_TYPES = [
    { value: "part_external", labelJa: "外装部品" },
    { value: "part_internal", labelJa: "内装部品" },
] as const;

export const PART_CATEGORIES: PartCategoryOption[] = [
    { key: "case_glass", partType: "part_external", labelJa: "ケース・風防" },
    { key: "crown_tube", partType: "part_external", labelJa: "リューズ・チューブ" },
    { key: "pushers", partType: "part_external", labelJa: "プッシャー" },
    { key: "bezel", partType: "part_external", labelJa: "ベゼル" },
    { key: "dial_hands", partType: "part_external", labelJa: "文字盤・針" },
    { key: "bracelet_band", partType: "part_external", labelJa: "ブレス・バンド" },
    { key: "mainspring_barrel", partType: "part_internal", labelJa: "動力・巻上" },
    { key: "train_wheel", partType: "part_internal", labelJa: "輪列" },
    { key: "escapement", partType: "part_internal", labelJa: "脱進機" },
    { key: "balance", partType: "part_internal", labelJa: "調速機" },
    { key: "keyless_works", partType: "part_internal", labelJa: "針回し" },
    { key: "calendar", partType: "part_internal", labelJa: "カレンダー" },
    { key: "automatic_winding", partType: "part_internal", labelJa: "自動巻" },
    { key: "chronograph", partType: "part_internal", labelJa: "クロノグラフ" },
    { key: "quartz", partType: "part_internal", labelJa: "クォーツ" },
    { key: "main_plate", partType: "part_internal", labelJa: "地板" },
];

type PartNameTuple = [
    key: string,
    categoryKey: string,
    nameJa: string,
    nameEn: string,
    extra?: Partial<Omit<PartNameOption, "key" | "partType" | "categoryKey" | "nameJa" | "nameEn">>,
];

function makePartNameOptions(partType: PartInputType, options: PartNameTuple[]): PartNameOption[] {
    return options.map(([key, categoryKey, nameJa, nameEn, extra]) => ({
        key,
        partType,
        categoryKey,
        nameJa,
        nameEn,
        ...extra,
    }));
}

const externalPartNameOptions = makePartNameOptions("part_external", [
    ["case", "case_glass", "ケース", "Case"],
    ["case_back", "case_glass", "裏蓋", "Case back"],
    ["acrylic_crystal", "case_glass", "風防", "Acrylic crystal"],
    ["tension_ring_acrylic_crystal", "case_glass", "風防（テンションリング）", "Tension ring acrylic crystal"],
    ["mineral_crystal", "case_glass", "ガラス", "Mineral crystal"],
    ["sapphire_crystal", "case_glass", "サファイアガラス", "Sapphire crystal"],
    ["crystal_gasket", "case_glass", "ガラスパッキン", "Crystal gasket"],
    ["crystal_plastic_gasket", "case_glass", "ガラスプラパッキン", "Plastic crystal gasket"],
    ["case_back_gasket", "case_glass", "裏蓋パッキン", "Case back gasket"],
    ["case_back_plastic_gasket", "case_glass", "裏蓋プラパッキン", "Plastic case back gasket"],
    ["case_screw", "case_glass", "ケースネジ", "Case screw"],
    ["case_back_screw", "case_glass", "裏蓋ネジ", "Case back screw"],
    ["case_pin", "case_glass", "ケースピン", "Case pin"],
    ["other_case_part", "case_glass", "その他ケース部品", "Other case part"],
    ["crown", "crown_tube", "リューズ", "Crown"],
    ["screw_down_crown", "crown_tube", "リューズ（ねじ込み）", "Screw-down crown"],
    ["crown_tube", "crown_tube", "チューブ", "Crown tube"],
    ["crown_side_threaded_tube", "crown_tube", "チューブ（リューズ側ねじ）", "Crown-side threaded tube"],
    ["case_side_threaded_tube", "crown_tube", "チューブ（ケース側ねじ）", "Case-side threaded tube"],
    ["double_threaded_crown_tube", "crown_tube", "チューブ（ケース側ねじ・リューズ側ねじ）", "Double threaded crown tube"],
    ["crown_gasket", "crown_tube", "リューズパッキン", "Crown gasket"],
    ["crown_tube_gasket", "crown_tube", "チューブパッキン", "Crown tube gasket"],
    ["pusher", "pushers", "プッシャー", "Pusher"],
    ["pusher_gasket", "pushers", "プッシャーパッキン", "Pusher gasket"],
    ["pusher_tube", "pushers", "プッシャーチューブ", "Pusher tube"],
    ["pusher_spring", "pushers", "プッシャースプリング", "Pusher spring"],
    ["pusher_screw", "pushers", "プッシャーネジ", "Pusher screw"],
    ["pusher_pin", "pushers", "プッシャーピン", "Pusher pin"],
    ["bezel", "bezel", "ベゼル", "Bezel"],
    ["bezel_insert", "bezel", "ベゼルインサート", "Bezel insert"],
    ["rotating_bezel", "bezel", "回転ベゼル", "Rotating bezel"],
    ["bezel_gasket", "bezel", "ベゼルパッキン", "Bezel gasket"],
    ["bezel_spring", "bezel", "ベゼルスプリング", "Bezel spring"],
    ["bezel_screw", "bezel", "ベゼルネジ", "Bezel screw"],
    ["bezel_pin", "bezel", "ベゼルピン", "Bezel pin"],
    ["luminous_pip", "bezel", "ルミナスポイント", "Luminous pip"],
    ["dial", "dial_hands", "文字盤", "Dial"],
    ["index", "dial_hands", "インデックス", "Index"],
    ["lume", "dial_hands", "蓄光", "Lume"],
    ["hour_hand_center", "dial_hands", "時針", "Hour hand", { displayJa: "時針・センター", displayEn: "Center hour hand", handPosition: "center" }],
    ["minute_hand_center", "dial_hands", "分針", "Minute hand", { displayJa: "分針・センター", displayEn: "Center minute hand", handPosition: "center" }],
    ["second_hand_center", "dial_hands", "秒針", "Second hand", { displayJa: "秒針・センター", displayEn: "Center second hand", handPosition: "center" }],
    ["hand_set_center", "dial_hands", "針セット", "Hand set", { displayJa: "針セット・センター", displayEn: "Center hand set", handPosition: "center" }],
    ["hour_hand_6h", "dial_hands", "時針", "Hour hand", { displayJa: "時針・6H", displayEn: "6H hour hand", handPosition: "6H" }],
    ["minute_hand_6h", "dial_hands", "分針", "Minute hand", { displayJa: "分針・6H", displayEn: "6H minute hand", handPosition: "6H" }],
    ["second_hand_6h", "dial_hands", "秒針", "Second hand", { displayJa: "秒針・6H", displayEn: "6H second hand", handPosition: "6H" }],
    ["chronograph_second_hand_center", "dial_hands", "クロノ秒針", "Chronograph seconds hand", { displayJa: "クロノ秒針・センター", displayEn: "Center chronograph seconds hand", handPosition: "center" }],
    ["minute_recorder_hand_3h", "dial_hands", "分積算針", "Minute recorder hand", { displayJa: "分積算針・3H", displayEn: "3H minute recorder hand", handPosition: "3H" }],
    ["minute_recorder_hand_6h", "dial_hands", "分積算針", "Minute recorder hand", { displayJa: "分積算針・6H", displayEn: "6H minute recorder hand", handPosition: "6H" }],
    ["minute_recorder_hand_9h", "dial_hands", "分積算針", "Minute recorder hand", { displayJa: "分積算針・9H", displayEn: "9H minute recorder hand", handPosition: "9H" }],
    ["hour_recorder_hand_3h", "dial_hands", "時積算針", "Hour recorder hand", { displayJa: "時積算針・3H", displayEn: "3H hour recorder hand", handPosition: "3H" }],
    ["hour_recorder_hand_6h", "dial_hands", "時積算針", "Hour recorder hand", { displayJa: "時積算針・6H", displayEn: "6H hour recorder hand", handPosition: "6H" }],
    ["hour_recorder_hand_9h", "dial_hands", "時積算針", "Hour recorder hand", { displayJa: "時積算針・9H", displayEn: "9H hour recorder hand", handPosition: "9H" }],
    ["twenty_four_hour_hand_center", "dial_hands", "24時間針", "24-hour hand", { displayJa: "24時間針・センター", displayEn: "Center 24-hour hand", handPosition: "center" }],
    ["twenty_four_hour_hand_6h", "dial_hands", "24時間針", "24-hour hand", { displayJa: "24時間針・6H", displayEn: "6H 24-hour hand", handPosition: "6H" }],
    ["gmt_hand_center", "dial_hands", "GMT針", "GMT hand", { displayJa: "GMT針・センター", displayEn: "Center GMT hand", handPosition: "center" }],
    ["pointer_hand_3h", "dial_hands", "指示針", "Pointer hand", { displayJa: "指示針・3H", displayEn: "3H pointer hand", handPosition: "3H" }],
    ["pointer_hand_6h", "dial_hands", "指示針", "Pointer hand", { displayJa: "指示針・6H", displayEn: "6H pointer hand", handPosition: "6H" }],
    ["pointer_hand_9h", "dial_hands", "指示針", "Pointer hand", { displayJa: "指示針・9H", displayEn: "9H pointer hand", handPosition: "9H" }],
    ["pointer_hand_12h", "dial_hands", "指示針", "Pointer hand", { displayJa: "指示針・12H", displayEn: "12H pointer hand", handPosition: "12H" }],
    ["bracelet", "bracelet_band", "ブレスレット", "Bracelet"],
    ["strap", "bracelet_band", "バンド", "Strap"],
    ["link", "bracelet_band", "コマ", "Link"],
    ["clasp", "bracelet_band", "クラスプ", "Clasp"],
    ["buckle", "bracelet_band", "バックル", "Buckle"],
    ["spring_bar", "bracelet_band", "バネ棒", "Spring bar"],
    ["end_link", "bracelet_band", "エンドリンク", "End link"],
    ["flush_fit", "bracelet_band", "フラッシュフィット", "Flush fit"],
    ["bracelet_pin", "bracelet_band", "ピン", "Pin"],
    ["c_clip", "bracelet_band", "Cリング", "C-clip"],
    ["screw_pin", "bracelet_band", "ネジピン", "Screw pin"],
    ["clasp_screw", "bracelet_band", "クラスプネジ", "Clasp screw"],
    ["clasp_spring", "bracelet_band", "クラスプバネ", "Clasp spring"],
]);

const internalPartNameOptions = makePartNameOptions("part_internal", [
    ["mainspring", "mainspring_barrel", "ゼンマイ", "Mainspring"],
    ["barrel", "mainspring_barrel", "香箱", "Barrel"],
    ["barrel_arbor", "mainspring_barrel", "香箱真", "Barrel arbor"],
    ["barrel_complete", "mainspring_barrel", "香箱一式（ゼンマイ込み）", "Barrel complete"],
    ["ratchet_wheel", "mainspring_barrel", "角穴車", "Ratchet wheel"],
    ["crown_wheel", "mainspring_barrel", "丸穴車", "Crown wheel"],
    ["click", "mainspring_barrel", "コハゼ", "Click"],
    ["click_spring", "mainspring_barrel", "コハゼバネ", "Click spring"],
    ["ratchet_wheel_screw", "mainspring_barrel", "角穴ネジ", "Ratchet wheel screw"],
    ["crown_wheel_screw", "mainspring_barrel", "丸穴ネジ", "Crown wheel screw"],
    ["crown_wheel_washer", "mainspring_barrel", "丸穴座", "Crown wheel washer"],
    ["barrel_bushing_upper", "mainspring_barrel", "ブッシュ（香箱）上", "Upper barrel bushing", { movementTarget: "barrel", movementPosition: "upper" }],
    ["barrel_bushing_lower", "mainspring_barrel", "ブッシュ（香箱）下", "Lower barrel bushing", { movementTarget: "barrel", movementPosition: "lower" }],
    ["barrel_hole_jewel_upper", "mainspring_barrel", "穴石（香箱）上", "Upper barrel hole jewel", { movementTarget: "barrel", movementPosition: "upper" }],
    ["barrel_hole_jewel_lower", "mainspring_barrel", "穴石（香箱）下", "Lower barrel hole jewel", { movementTarget: "barrel", movementPosition: "lower" }],
    ["first_wheel_bridge", "mainspring_barrel", "一番受け", "First wheel bridge"],
    ["first_wheel_bridge_screw", "mainspring_barrel", "一番受けネジ", "First wheel bridge screw"],
    ["center_wheel", "train_wheel", "二番車", "Center wheel"],
    ["third_wheel", "train_wheel", "三番車", "Third wheel"],
    ["fourth_wheel", "train_wheel", "四番車", "Fourth wheel"],
    ["fifth_wheel", "train_wheel", "五番車", "Fifth wheel"],
    ["seconds_pinion", "train_wheel", "秒カナ", "Seconds pinion"],
    ["intermediate_wheel", "train_wheel", "伝え車", "Intermediate wheel"],
    ["driving_wheel", "train_wheel", "出車", "Driving wheel"],
    ["train_wheel_bridge", "train_wheel", "輪列受", "Train wheel bridge"],
    ["center_wheel_bridge", "train_wheel", "二番受け", "Center wheel bridge"],
    ["train_wheel_bridge_screw", "train_wheel", "輪列受けネジ", "Train wheel bridge screw"],
    ["center_wheel_bridge_screw", "train_wheel", "二番受けネジ", "Center wheel bridge screw"],
    ["stop_lever", "train_wheel", "規制レバー", "Stop lever"],
    ["center_wheel_hole_jewel_upper", "train_wheel", "二番穴石（上）", "Upper center wheel hole jewel", { movementTarget: "center_wheel", movementPosition: "upper" }],
    ["center_wheel_hole_jewel_lower", "train_wheel", "二番穴石（下）", "Lower center wheel hole jewel", { movementTarget: "center_wheel", movementPosition: "lower" }],
    ["third_wheel_hole_jewel_upper", "train_wheel", "三番穴石（上）", "Upper third wheel hole jewel", { movementTarget: "third_wheel", movementPosition: "upper" }],
    ["third_wheel_hole_jewel_lower", "train_wheel", "三番穴石（下）", "Lower third wheel hole jewel", { movementTarget: "third_wheel", movementPosition: "lower" }],
    ["fourth_wheel_hole_jewel_upper", "train_wheel", "四番穴石（上）", "Upper fourth wheel hole jewel", { movementTarget: "fourth_wheel", movementPosition: "upper" }],
    ["fourth_wheel_hole_jewel_lower", "train_wheel", "四番穴石（下）", "Lower fourth wheel hole jewel", { movementTarget: "fourth_wheel", movementPosition: "lower" }],
    ["fifth_wheel_hole_jewel_upper", "train_wheel", "五番穴石（上）", "Upper fifth wheel hole jewel", { movementTarget: "fifth_wheel", movementPosition: "upper" }],
    ["fifth_wheel_hole_jewel_lower", "train_wheel", "五番穴石（下）", "Lower fifth wheel hole jewel", { movementTarget: "fifth_wheel", movementPosition: "lower" }],
    ["pallet_fork", "escapement", "アンクル", "Pallet fork"],
    ["escape_wheel", "escapement", "ガンギ車", "Escape wheel"],
    ["pallet_stone", "escapement", "爪石", "Pallet stone"],
    ["pallet_bridge", "escapement", "アンクル受", "Pallet bridge"],
    ["pallet_staff", "escapement", "アンクル真", "Pallet staff"],
    ["pallet_bridge_screw", "escapement", "アンクル受けネジ", "Pallet bridge screw"],
    ["escape_wheel_hole_jewel_upper", "escapement", "ガンギ穴石（上）", "Upper escape wheel hole jewel", { movementTarget: "escape_wheel", movementPosition: "upper" }],
    ["escape_wheel_hole_jewel_lower", "escapement", "ガンギ穴石（下）", "Lower escape wheel hole jewel", { movementTarget: "escape_wheel", movementPosition: "lower" }],
    ["pallet_hole_jewel_upper", "escapement", "アンクル穴石（上）", "Upper pallet hole jewel", { movementTarget: "pallet", movementPosition: "upper" }],
    ["pallet_hole_jewel_lower", "escapement", "アンクル穴石（下）", "Lower pallet hole jewel", { movementTarget: "pallet", movementPosition: "lower" }],
    ["pallet_cap_jewel_upper", "escapement", "アンクル受石（上）", "Upper pallet cap jewel", { movementTarget: "pallet", movementPosition: "upper" }],
    ["pallet_cap_jewel_lower", "escapement", "アンクル受石（下）", "Lower pallet cap jewel", { movementTarget: "pallet", movementPosition: "lower" }],
    ["escape_wheel_cap_jewel_upper", "escapement", "ガンギ受石（上）", "Upper escape wheel cap jewel", { movementTarget: "escape_wheel", movementPosition: "upper" }],
    ["escape_wheel_cap_jewel_lower", "escapement", "ガンギ受石（下）", "Lower escape wheel cap jewel", { movementTarget: "escape_wheel", movementPosition: "lower" }],
    ["pallet_shock_hole_jewel_setting_upper", "escapement", "アンクル耐震穴石座（上）", "Upper pallet shock hole jewel setting", { movementTarget: "pallet", movementPosition: "upper" }],
    ["pallet_shock_hole_jewel_setting_lower", "escapement", "アンクル耐震穴石座（下）", "Lower pallet shock hole jewel setting", { movementTarget: "pallet", movementPosition: "lower" }],
    ["pallet_shock_hole_jewel_upper", "escapement", "アンクル耐震穴石（上）", "Upper pallet shock hole jewel", { movementTarget: "pallet", movementPosition: "upper" }],
    ["pallet_shock_hole_jewel_lower", "escapement", "アンクル耐震穴石（下）", "Lower pallet shock hole jewel", { movementTarget: "pallet", movementPosition: "lower" }],
    ["pallet_shock_cap_jewel_upper", "escapement", "アンクル耐震受石（上）", "Upper pallet shock cap jewel", { movementTarget: "pallet", movementPosition: "upper" }],
    ["pallet_shock_cap_jewel_lower", "escapement", "アンクル耐震受石（下）", "Lower pallet shock cap jewel", { movementTarget: "pallet", movementPosition: "lower" }],
    ["pallet_shock_spring_upper", "escapement", "アンクル耐震バネ（上）", "Upper pallet shock spring", { movementTarget: "pallet", movementPosition: "upper" }],
    ["pallet_shock_spring_lower", "escapement", "アンクル耐震バネ（下）", "Lower pallet shock spring", { movementTarget: "pallet", movementPosition: "lower" }],
    ["pallet_shock_complete_upper", "escapement", "アンクル耐震軸受け（一体・上）", "Upper pallet shock complete", { movementTarget: "pallet", movementPosition: "upper" }],
    ["pallet_shock_complete_lower", "escapement", "アンクル耐震軸受け（一体・下）", "Lower pallet shock complete", { movementTarget: "pallet", movementPosition: "lower" }],
    ["escape_wheel_shock_hole_jewel_setting_upper", "escapement", "ガンギ耐震穴石座（上）", "Upper escape wheel shock hole jewel setting", { movementTarget: "escape_wheel", movementPosition: "upper" }],
    ["escape_wheel_shock_hole_jewel_setting_lower", "escapement", "ガンギ耐震穴石座（下）", "Lower escape wheel shock hole jewel setting", { movementTarget: "escape_wheel", movementPosition: "lower" }],
    ["escape_wheel_shock_hole_jewel_upper", "escapement", "ガンギ耐震穴石（上）", "Upper escape wheel shock hole jewel", { movementTarget: "escape_wheel", movementPosition: "upper" }],
    ["escape_wheel_shock_hole_jewel_lower", "escapement", "ガンギ耐震穴石（下）", "Lower escape wheel shock hole jewel", { movementTarget: "escape_wheel", movementPosition: "lower" }],
    ["escape_wheel_shock_cap_jewel_upper", "escapement", "ガンギ耐震受石（上）", "Upper escape wheel shock cap jewel", { movementTarget: "escape_wheel", movementPosition: "upper" }],
    ["escape_wheel_shock_cap_jewel_lower", "escapement", "ガンギ耐震受石（下）", "Lower escape wheel shock cap jewel", { movementTarget: "escape_wheel", movementPosition: "lower" }],
    ["escape_wheel_shock_spring_upper", "escapement", "ガンギ耐震バネ（上）", "Upper escape wheel shock spring", { movementTarget: "escape_wheel", movementPosition: "upper" }],
    ["escape_wheel_shock_spring_lower", "escapement", "ガンギ耐震バネ（下）", "Lower escape wheel shock spring", { movementTarget: "escape_wheel", movementPosition: "lower" }],
    ["escape_wheel_shock_complete_upper", "escapement", "ガンギ耐震軸受け（一体・上）", "Upper escape wheel shock complete", { movementTarget: "escape_wheel", movementPosition: "upper" }],
    ["escape_wheel_shock_complete_lower", "escapement", "ガンギ耐震軸受け（一体・下）", "Lower escape wheel shock complete", { movementTarget: "escape_wheel", movementPosition: "lower" }],
    ["balance_wheel", "balance", "テンプ", "Balance wheel"],
    ["balance_complete", "balance", "テンプ一式", "Balance complete"],
    ["balance_staff", "balance", "天真", "Balance staff"],
    ["hairspring", "balance", "ヒゲゼンマイ", "Hairspring"],
    ["roller_jewel", "balance", "振り石", "Roller jewel"],
    ["roller_table", "balance", "振座", "Roller table"],
    ["regulator", "balance", "緩急針", "Regulator"],
    ["hairspring_collet", "balance", "ヒゲ栓", "Hairspring collet"],
    ["balance_rim", "balance", "テン輪", "Balance rim"],
    ["hairspring_stud", "balance", "ヒゲ持ち", "Hairspring stud"],
    ["hairspring_stud_screw", "balance", "ヒゲ持ちネジ", "Hairspring stud screw"],
    ["balance_hole_jewel_upper", "balance", "テンプ穴石（上）", "Upper balance hole jewel", { movementTarget: "balance", movementPosition: "upper" }],
    ["balance_hole_jewel_lower", "balance", "テンプ穴石（下）", "Lower balance hole jewel", { movementTarget: "balance", movementPosition: "lower" }],
    ["balance_cap_jewel_upper", "balance", "テンプ受石（上）", "Upper balance cap jewel", { movementTarget: "balance", movementPosition: "upper" }],
    ["balance_cap_jewel_lower", "balance", "テンプ受石（下）", "Lower balance cap jewel", { movementTarget: "balance", movementPosition: "lower" }],
    ["balance_shock_hole_jewel_setting_upper", "balance", "テンプ耐震穴石座（上）", "Upper balance shock hole jewel setting", { movementTarget: "balance", movementPosition: "upper" }],
    ["balance_shock_hole_jewel_setting_lower", "balance", "テンプ耐震穴石座（下）", "Lower balance shock hole jewel setting", { movementTarget: "balance", movementPosition: "lower" }],
    ["balance_shock_hole_jewel_upper", "balance", "テンプ耐震穴石（上）", "Upper balance shock hole jewel", { movementTarget: "balance", movementPosition: "upper" }],
    ["balance_shock_hole_jewel_lower", "balance", "テンプ耐震穴石（下）", "Lower balance shock hole jewel", { movementTarget: "balance", movementPosition: "lower" }],
    ["balance_shock_cap_jewel_upper", "balance", "テンプ耐震受石（上）", "Upper balance shock cap jewel", { movementTarget: "balance", movementPosition: "upper" }],
    ["balance_shock_cap_jewel_lower", "balance", "テンプ耐震受石（下）", "Lower balance shock cap jewel", { movementTarget: "balance", movementPosition: "lower" }],
    ["balance_shock_spring_upper", "balance", "テンプ耐震バネ（上）", "Upper balance shock spring", { movementTarget: "balance", movementPosition: "upper" }],
    ["balance_shock_spring_lower", "balance", "テンプ耐震バネ（下）", "Lower balance shock spring", { movementTarget: "balance", movementPosition: "lower" }],
    ["balance_shock_complete_upper", "balance", "テンプ耐震軸受け（一体・上）", "Upper balance shock complete", { movementTarget: "balance", movementPosition: "upper" }],
    ["balance_shock_complete_lower", "balance", "テンプ耐震軸受け（一体・下）", "Lower balance shock complete", { movementTarget: "balance", movementPosition: "lower" }],
    ["stem_internal", "keyless_works", "巻真", "Stem"],
    ["sliding_pinion", "keyless_works", "ツヅミ車", "Sliding pinion"],
    ["winding_pinion", "keyless_works", "キチ車", "Winding pinion"],
    ["setting_wheel_keyless", "keyless_works", "小鉄車", "Setting wheel"],
    ["minute_wheel_keyless", "keyless_works", "日の裏車", "Minute wheel"],
    ["setting_lever", "keyless_works", "オシドリ", "Setting lever"],
    ["yoke", "keyless_works", "カンヌキ", "Yoke"],
    ["yoke_spring", "keyless_works", "カンヌキバネ", "Yoke spring"],
    ["setting_lever_jumper", "keyless_works", "裏押さえ", "Setting lever jumper"],
    ["intermediate_wheel_keyless", "keyless_works", "伝え車", "Intermediate wheel"],
    ["setting_lever_screw", "keyless_works", "オシドリネジ", "Setting lever screw"],
    ["setting_lever_pin", "keyless_works", "オシドリピン", "Setting lever pin"],
    ["cannon_pinion_keyless", "keyless_works", "筒カナ", "Cannon pinion"],
    ["hour_wheel", "keyless_works", "筒車", "Hour wheel"],
    ["minute_work_cover", "keyless_works", "日の裏押さえ", "Minute work cover"],
    ["minute_work_cover_screw", "keyless_works", "日の裏押さえネジ", "Minute work cover screw"],
    ["setting_lever_jumper_screw", "keyless_works", "裏押さえネジ", "Setting lever jumper screw"],
    ["minute_wheel_bridge", "keyless_works", "分車", "Minute wheel bridge"],
    ["date_wheel", "calendar", "日板", "Date wheel"],
    ["day_wheel", "calendar", "曜板", "Day wheel"],
    ["date_driving_wheel", "calendar", "日送り車", "Date driving wheel"],
    ["date_jumper", "calendar", "日送り爪", "Date jumper"],
    ["calendar_plate", "calendar", "カレンダー押さえ", "Calendar plate"],
    ["corrector_wheel", "calendar", "修正車", "Corrector wheel"],
    ["intermediate_date_wheel", "calendar", "日送り中間車", "Intermediate date wheel"],
    ["corrector_intermediate_wheel", "calendar", "修正伝え車", "Corrector intermediate wheel"],
    ["calendar_plate_screw", "calendar", "カレンダー押さえネジ", "Calendar plate screw"],
    ["rotor", "automatic_winding", "ローター", "Rotor"],
    ["automatic_bridge", "automatic_winding", "自動巻受", "Automatic bridge"],
    ["reversing_wheel", "automatic_winding", "切替車", "Reversing wheel"],
    ["winding_wheel", "automatic_winding", "巻上車", "Winding wheel"],
    ["reduction_wheel", "automatic_winding", "減速車", "Reduction wheel"],
    ["ball_bearing", "automatic_winding", "ボールベアリング", "Ball bearing"],
    ["pawl_lever", "automatic_winding", "爪レバー", "Pawl lever"],
    ["automatic_bridge_screw", "automatic_winding", "自動巻受ネジ", "Automatic bridge screw"],
    ["chronograph_wheel", "chronograph", "クロノグラフ車", "Chronograph wheel"],
    ["chronograph_seconds_wheel", "chronograph", "クロノ秒車", "Chronograph seconds wheel"],
    ["minute_recorder_wheel", "chronograph", "分積算車", "Minute recorder wheel"],
    ["hour_recorder_wheel", "chronograph", "時積算車", "Hour recorder wheel"],
    ["reset_hammer", "chronograph", "リセットハンマー", "Reset hammer"],
    ["heart_cam", "chronograph", "ハートカム", "Heart cam"],
    ["clutch_lever", "chronograph", "クラッチレバー", "Clutch lever"],
    ["column_wheel", "chronograph", "コラムホイール", "Column wheel"],
    ["cam", "chronograph", "カム", "Cam"],
    ["circuit_block", "quartz", "回路", "Circuit block"],
    ["coil", "quartz", "コイル", "Coil"],
    ["stator", "quartz", "ステーター", "Stator"],
    ["step_rotor", "quartz", "ステップローター", "Step rotor"],
    ["capacitor", "quartz", "キャパシタ", "Capacitor"],
    ["fifth_wheel_quartz", "quartz", "五番車", "Fifth wheel"],
    ["main_plate", "main_plate", "地板", "Main plate"],
    ["dial_screw", "main_plate", "文字盤止めネジ", "Dial screw"],
    ["movement_case_screw", "main_plate", "機止めネジ", "Movement case screw"],
    ["center_pipe", "main_plate", "中心パイプ", "Center pipe"],
]);

export const PART_NAME_OPTIONS: PartNameOption[] = [
    ...externalPartNameOptions,
    ...internalPartNameOptions,
];

export function getPartCategoriesByType(partType: PartInputType): PartCategoryOption[] {
    return PART_CATEGORIES.filter((category) => category.partType === partType);
}

export function getPartNamesByCategory(categoryKey: string): PartNameOption[] {
    return PART_NAME_OPTIONS.filter((option) => option.categoryKey === categoryKey);
}

export function getPartNameOptionByKey(key: string): PartNameOption | undefined {
    return PART_NAME_OPTIONS.find((option) => option.key === key);
}

export function searchPartNameOptions(keyword: string, partType?: PartInputType): PartNameOption[] {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    const options = partType
        ? PART_NAME_OPTIONS.filter((option) => option.partType === partType)
        : PART_NAME_OPTIONS;

    if (!normalizedKeyword) return options;

    return options.filter((option) =>
        [option.nameJa, option.nameEn, option.displayJa, option.displayEn]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLocaleLowerCase().includes(normalizedKeyword))
    );
}
