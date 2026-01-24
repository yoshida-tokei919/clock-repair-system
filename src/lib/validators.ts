export const MasterValidators = {
  // Brand: Half-width Alphanumeric AND/OR Full-width Katakana (Space allowed)
  // Requirement: "Half-width Alpha + Full-width Kana"
  // e.g. "ROLEX", "ロレックス", "ROLEX ロレックス", "TAG HEUER"
  brand: (value: string) => {
    return value.trim().length > 0;
  },

  // Model: More permissive
  model: (value: string) => {
    return value.trim().length > 0;
  },

  // Ref / Caliber / BeltRef / PartRef: Half-width Alphanumeric
  // Requirement: "Half-width Alphanumeric"
  // e.g. "16233", "3135", "116500LN"
  ref: (value: string) => {
    return value.trim().length > 0;
  },

  // Part Name: Permissive
  partName: (value: string) => {
    return value.trim().length > 0;
  }
};

export const ValidationMessages = {
  brand: "ブランド名を入力してください。",
  model: "モデル名を入力してください。",
  ref: "型番(Ref/Cal)を入力してください。",
  partName: "部品名を入力してください。"
};
