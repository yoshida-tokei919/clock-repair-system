type BrandScoped = { brandId: number | null };

export function filterModelsForBrand<T extends { brandId: number }>(models: T[], brandId?: number | null) {
    return brandId ? models.filter((model) => model.brandId === brandId) : models;
}

export function filterCalibersForMaker<T extends BrandScoped>(calibers: T[], makerId?: number | null) {
    return makerId ? calibers.filter((caliber) => caliber.brandId === makerId) : calibers;
}
