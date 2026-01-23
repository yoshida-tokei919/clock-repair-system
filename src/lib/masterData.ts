
export interface MasterItem {
    id: string;
    name: string;        // Primary Search Key
    nameEn?: string;     // English Name
    nameJp?: string;     // Japanese Name

    // Relationships
    parentId?: string;   // e.g. Model belongs to Brand
    children?: string[]; // IDs of related items

    // Specific Attributes
    caliberId?: string;  // For Refs: Links to Caliber
}

export interface WorkItem {
    id: string;
    name: string;
    price: number;
    category: 'internal' | 'external';
    targetId?: string;   // Related Caliber ID (Internal) or Ref ID (External)
}

export interface PartItem {
    id: string;
    type: 'internal' | 'external';
    brandId?: string; // Legacy / Mock
    brand?: string;   // API Response (Brand Name)
    targetId: string; // caliberId (Internal) or refId (External)
    name: string;     // Part Name
    ref: string;      // Part Ref
    costPrice: number;   // 仕入れ価格
    retailPrice: number; // 上代価格
    stock: number;
    supplier?: string;   // 購入店
    notes?: string;      // 備考
}

// ---------------------------------------------------------
// MOCK DATA STORE
// ---------------------------------------------------------

// 1. BRAND
export const BRANDS_DB: MasterItem[] = [
    { id: "b1", name: "ROLEX ロレックス", nameEn: "ROLEX", nameJp: "ロレックス", children: ["m1", "m2"] },
    { id: "b2", name: "OMEGA オメガ", nameEn: "OMEGA", nameJp: "オメガ", children: ["m3"] },
    { id: "b3", name: "SEIKO セイコー", nameEn: "SEIKO", nameJp: "セイコー" },
    { id: "b4", name: "CARTIER カルティエ", nameEn: "CARTIER", nameJp: "カルティエ" },
    { id: "b5", name: "PANERAI パネライ", nameEn: "PANERAI", nameJp: "パネライ" }
];

// 2. MODEL
export const MODELS_DB: MasterItem[] = [
    { id: "m1", name: "デイトジャスト", nameEn: "DATEJUST", nameJp: "デイトジャスト", parentId: "b1", children: ["r1", "r2", "r3"] },
    { id: "m2", name: "サブマリーナ", nameEn: "SUBMARINER", nameJp: "サブマリーナ", parentId: "b1" },
    { id: "m3", name: "スピードマスター", nameEn: "SPEEDMASTER", nameJp: "スピードマスター", parentId: "b2" },
];

// 3. REF
export const REFS_DB: MasterItem[] = [
    { id: "r1", name: "16233", caliberId: "c2", parentId: "m1" },
    { id: "r2", name: "16234", caliberId: "c2", parentId: "m1" },
    { id: "r3", name: "69173", caliberId: "c5", parentId: "m1" },
    { id: "r4", name: "16610", caliberId: "c2", parentId: "m2" },
    { id: "r5", name: "14060", caliberId: "c2", parentId: "m2" },
    { id: "r6", name: "116610LN", caliberId: "c2", parentId: "m2" },
    { id: "r7", name: "3570.50", caliberId: "c3", parentId: "m3" },
    { id: "r8", name: "311.30.42", caliberId: "c3", parentId: "m3" },
];

// 4. CALIBER
export const CALIBERS_DB: MasterItem[] = [
    { id: "c1", name: "4130" },
    { id: "c2", name: "3135" },
    { id: "c3", name: "1861" },
    { id: "c4", name: "ETA 2892" },
    { id: "c5", name: "2135" },
];

// 5. WORK CONTENT
export const WORK_DB: WorkItem[] = [
    { id: "w1", name: "オーバーホール", price: 45000, category: "internal", targetId: "c2" },
    { id: "w2", name: "オーバーホール", price: 65000, category: "internal", targetId: "c1" },
    { id: "w3", name: "時間調整", price: 3000, category: "internal", targetId: "c2" },
    { id: "w4", name: "ガラス交換", price: 15000, category: "external", targetId: "r1" },
    { id: "w5", name: "新品仕上げ", price: 20000, category: "external", targetId: "r1" },
];

// 6. PARTS DB
// Updated with Cost/Retail/Supplier/Notes
export const PARTS_DB: PartItem[] = [
    { id: "p1", type: "internal", brandId: "b1", targetId: "c2", name: "ゼンマイ", ref: "3135-100", costPrice: 3000, retailPrice: 4650, stock: 5, supplier: "eBay", notes: "純正品" },
    { id: "p1_dup", type: "internal", brandId: "b1", targetId: "c2", name: "ゼンマイ", ref: "3135-100-G", costPrice: 1500, retailPrice: 2000, stock: 10, supplier: "Generic", notes: "ジェネリック" },
    { id: "p2", type: "external", brandId: "b1", targetId: "r1", name: "リューズ", ref: "24-603", costPrice: 12000, retailPrice: 18600, stock: 2, supplier: "Yahoo", notes: "中古良品" },
];


// ---------------------------------------------------------
// HELPER FUNCTIONS (API MOCK)
// ---------------------------------------------------------

export const formatBrandName = (item: MasterItem) => {
    if (item.nameEn && item.nameJp) return `${item.nameEn} ${item.nameJp}`;
    return item.name;
};

export const MasterService = {
    // --- READ ---
    getBrands: () => BRANDS_DB.map(b => formatBrandName(b)),

    getModelsForBrand: (brandInput: string) => {
        const brand = BRANDS_DB.find(b => formatBrandName(b) === brandInput || b.name === brandInput);
        if (!brand) return [];
        return MODELS_DB.filter(m => m.parentId === brand.id).map(m => m.nameJp || m.name);
    },

    getRefsForModel: (modelInput: string) => {
        const model = MODELS_DB.find(m => m.name === modelInput || m.nameJp === modelInput);
        if (!model) return [];
        return REFS_DB.filter(r => r.parentId === model.id).map(r => r.name);
    },

    getCaliberForRef: (refName: string) => {
        const ref = REFS_DB.find(r => r.name === refName);
        if (!ref || !ref.caliberId) return null;
        const cal = CALIBERS_DB.find(c => c.id === ref.caliberId);
        return cal ? cal.name : null;
    },

    getCalibers: () => CALIBERS_DB.map(c => c.name),

    // --- PARTS ---
    getParts: () => PARTS_DB,

    // --- PRICING ---
    getInternalWorkOptions: (calName: string) => {
        const cal = CALIBERS_DB.find(c => c.name === calName);
        if (!cal) return [];
        return WORK_DB.filter(w => w.category === 'internal' && w.targetId === cal.id);
    },

    getExternalWorkOptions: (refName: string) => {
        const ref = REFS_DB.find(r => r.name === refName);
        if (!ref) return [];
        return WORK_DB.filter(w => w.category === 'external' && w.targetId === ref.id);
    },

    // --- PARTS LOOKUP ---
    getPartsForCaliber: (calName: string) => {
        const cal = CALIBERS_DB.find(c => c.name === calName);
        if (!cal) return [];
        return PARTS_DB.filter(p => p.type === 'internal' && p.targetId === cal.id);
    },

    getPartsForRef: (refName: string) => {
        const ref = REFS_DB.find(r => r.name === refName);
        if (!ref) return [];
        return PARTS_DB.filter(p => p.type === 'external' && p.targetId === ref.id);
    },

    // --- UPSERT ---
    upsertBrand: (input: string) => {
        if (BRANDS_DB.some(b => formatBrandName(b) === input)) return;
        const parts = input.split(' ');
        const newItem: MasterItem = { id: `b${Date.now()}`, name: input, nameEn: parts[0] || input, nameJp: parts[1] || "" };
        BRANDS_DB.push(newItem);
    },

    upsertModel: (brandInput: string, modelInput: string) => {
        const brand = BRANDS_DB.find(b => formatBrandName(b) === brandInput);
        if (!brand) return;
        if (MODELS_DB.some(m => m.name === modelInput && m.parentId === brand.id)) return;
        const newItem: MasterItem = { id: `m${Date.now()}`, name: modelInput, nameJp: modelInput, parentId: brand.id };
        MODELS_DB.push(newItem);
    },

    upsertRef: (modelInput: string, refInput: string) => {
        const model = MODELS_DB.find(m => m.name === modelInput || m.nameJp === modelInput);
        if (!model) return;
        if (REFS_DB.some(r => r.name === refInput && r.parentId === model.id)) return;
        const newItem: MasterItem = { id: `r${Date.now()}`, name: refInput, parentId: model.id };
        REFS_DB.push(newItem);
    },

    upsertPart: (newItem: Omit<PartItem, 'id'>) => {
        // Allow duplicates with different suppliers/prices, but if exact match, return it
        const exists = PARTS_DB.find(p =>
            p.name === newItem.name &&
            p.costPrice === newItem.costPrice &&
            p.supplier === newItem.supplier &&
            p.targetId === newItem.targetId
        );
        if (exists) return exists;

        const newPart = { id: `p${Date.now()}`, ...newItem };
        PARTS_DB.push(newPart);
        return newPart;
    },

    upsertWork: (newItem: Omit<WorkItem, 'id'>) => {
        const exists = WORK_DB.find(w =>
            w.name === newItem.name &&
            w.category === newItem.category &&
            w.targetId === newItem.targetId
        );
        if (exists) return exists;

        const newWork = { id: `w${Date.now()}`, ...newItem };
        WORK_DB.push(newWork);
        return newWork;
    }
};

// Legacy Exports
export const BRAND_MASTER = BRANDS_DB;
export const CALIBER_MASTER = CALIBERS_DB;
export const getPriceForCaliber = (calName: string) => {
    const opts = MasterService.getInternalWorkOptions(calName);
    const oh = opts.find(o => o.name.includes("オーバーホール"));
    return oh ? oh.price : 0;
};
export const getModelsForBrand = MasterService.getModelsForBrand;
