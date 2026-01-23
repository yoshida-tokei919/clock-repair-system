export const MasterValidators = {
  // Brand: Half-width Alphanumeric AND/OR Full-width Katakana (Space allowed)
  // Requirement: "Half-width Alpha + Full-width Kana"
  // e.g. "ROLEX", "ロレックス", "ROLEX ロレックス", "TAG HEUER"
  brand: (value: string) => {
    // Must contain ONLY: Alphanumeric, Spaces, Full-width Katakana
    // And SHOULD ideally contain at least one valid char
    const regex = /^[a-zA-Z0-9\s\u30A0-\u30FF]+$/;
    return regex.test(value) && value.trim().length > 0;
  },

  // Model: Full-width Katakana only
  // Requirement: "Model name: Full-width Katakana"
  // e.g. "デイトジャスト", "サブマリーナ"
  model: (value: string) => {
    // Only Katakana and spaces allowed (no alphabets, no numbers unless full-width? User said "Full-width Katakana")
    // Use inclusive range for Katakana
    const regex = /^[\u30A0-\u30FF\s]+$/;
    return regex.test(value);
  },

  // Ref / Caliber / BeltRef / PartRef: Half-width Alphanumeric
  // Requirement: "Half-width Alphanumeric"
  // e.g. "16233", "3135", "116500LN"
  ref: (value: string) => {
    // Typical Refs have hyphens or dots too, but user said "Half-width Alphanumeric".
    // We'll allow hyphens/dots/spaces as they are standard in watch refs, but warn if widespread non-ascii.
    const regex = /^[a-zA-Z0-9\-\.\s]+$/;
    return regex.test(value);
  },

  // Part Name: Full-width Katakana AND Half-width Alphanumeric
  // Requirement: "Full-width Katakana and Half-width Alphanumeric"
  partName: (value: string) => {
    const regex = /^[a-zA-Z0-9\s\u30A0-\u30FF\-\.]+$/;
    return regex.test(value);
  }
};

export const ValidationMessages = {
  brand: "ブランド名は半角英数字と全角カタカナのみ使用可能です（例: ROLEX ロレックス）。",
  model: "モデル名は全角カタカナのみ使用可能です（例: デイトジャスト）。",
  ref: "Ref/Caliber等は半角英数字（ハイフン可）のみ使用可能です（例: 16233）。",
  partName: "部品名は全角カタカナと半角英数字のみ使用可能です。"
};
