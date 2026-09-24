import type { PrismaClient } from "@prisma/client";
import { CANONICAL_BRANDS, canonicalBrandUpdateData } from "../src/lib/canonical-brands";
import { normalizeBrandName } from "../src/lib/master-normalize";

const apply = process.argv.includes("--apply");
const PRODUCTION_CONFIRMATION = "TASK175_CANONICAL_BRAND_IMPORT";
const PRODUCTION_CONFIRMATION_ENV = "PRODUCTION_CANONICAL_BRAND_IMPORT_CONFIRM";
let prisma: PrismaClient | undefined;

type CanonicalBrand = typeof CANONICAL_BRANDS[number];
type ExistingBrand = {
    id: number;
    name: string;
    nameEn: string | null;
    nameJp: string;
    brandKind: CanonicalBrand["brandKind"];
    isWatchBrand: boolean;
    isMovementMaker: boolean;
};

function aliasesFor(brand: CanonicalBrand) {
    return Array.from(new Set([brand.name, brand.nameEn, brand.nameJp, ...brand.aliases]));
}

function validateCanonicalAliases() {
    const owners = new Map<string, string>();
    const conflicts: string[] = [];
    for (const brand of CANONICAL_BRANDS) {
        for (const alias of aliasesFor(brand)) {
            const normalizedAlias = normalizeBrandName(alias);
            const owner = owners.get(normalizedAlias);
            if (owner && owner !== brand.name) conflicts.push(`${normalizedAlias}: ${owner} / ${brand.name}`);
            owners.set(normalizedAlias, brand.name);
        }
    }
    if (conflicts.length) throw new Error(`canonical alias conflicts:\n${conflicts.join("\n")}`);
}

function canonicalAliasRecords() {
    const records = new Map<string, { brandName: string; alias: string; normalizedAlias: string }>();
    for (const brand of CANONICAL_BRANDS) {
        for (const alias of aliasesFor(brand)) {
            const normalizedAlias = normalizeBrandName(alias);
            const existing = records.get(normalizedAlias);
            if (existing && existing.brandName !== brand.name) {
                throw new Error(`canonical alias conflicts: ${normalizedAlias}: ${existing.brandName} / ${brand.name}`);
            }
            if (!existing) records.set(normalizedAlias, { brandName: brand.name, alias, normalizedAlias });
        }
    }
    return Array.from(records.values());
}

function changedBrandData(existing: ExistingBrand, canonical: CanonicalBrand) {
    const canonicalData = canonicalBrandUpdateData(canonical);
    const data: Partial<typeof canonicalData> = {};
    if (existing.nameEn !== canonicalData.nameEn) data.nameEn = canonicalData.nameEn;
    if (existing.nameJp !== canonicalData.nameJp) data.nameJp = canonicalData.nameJp;
    if (existing.brandKind !== canonicalData.brandKind) data.brandKind = canonicalData.brandKind;
    if (existing.isWatchBrand !== canonicalData.isWatchBrand) data.isWatchBrand = canonicalData.isWatchBrand;
    if (canonicalData.isMovementMaker === true && !existing.isMovementMaker) data.isMovementMaker = true;
    return data;
}

function validateApplySafety() {
    if (!apply) return;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for --apply.");
    let url: URL;
    try {
        url = new URL(databaseUrl);
    } catch {
        throw new Error("Invalid DATABASE_URL for --apply.");
    }
    if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname) throw new Error("Invalid DATABASE_URL for --apply.");
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return;
    const confirmations = process.argv.slice(2).filter((arg) => arg.startsWith("--production-confirm="));
    if (confirmations.length !== 1 || confirmations[0] !== `--production-confirm=${PRODUCTION_CONFIRMATION}` || process.env[PRODUCTION_CONFIRMATION_ENV] !== PRODUCTION_CONFIRMATION) {
        throw new Error(`Non-local --apply requires --production-confirm=${PRODUCTION_CONFIRMATION} and matching ${PRODUCTION_CONFIRMATION_ENV}.`);
    }
}

async function main() {
    const { PrismaClient } = await import("@prisma/client");
    validateApplySafety();
    prisma = new PrismaClient();
    validateCanonicalAliases();
    const [existingBrands, existingAliases] = await Promise.all([
        prisma.brand.findMany({
            select: { id: true, name: true, nameEn: true, nameJp: true, brandKind: true, isWatchBrand: true, isMovementMaker: true },
        }),
        prisma.brandAlias.findMany({
            select: { normalizedAlias: true, brand: { select: { id: true, name: true } } },
        }),
    ]);

    const brandById = new Map(existingBrands.map((brand) => [brand.id, brand]));
    const brandByNormalizedName = new Map<string, ExistingBrand>();
    for (const brand of existingBrands) {
        for (const name of [brand.name, brand.nameEn, brand.nameJp]) {
            const normalizedName = normalizeBrandName(name);
            if (normalizedName && !brandByNormalizedName.has(normalizedName)) brandByNormalizedName.set(normalizedName, brand);
        }
    }
    const aliasByNormalizedName = new Map<string, { id: number; name: string }>(existingAliases.map((alias) => [alias.normalizedAlias, alias.brand]));
    const collisions: string[] = [];
    const creates: CanonicalBrand[] = [];
    const updates: Array<{ existing: ExistingBrand; data: ReturnType<typeof changedBrandData> }> = [];
    const plan = { CREATE: 0, UPDATE: 0, aliasCreate: 0, SKIP: 0, movementMakerTruePreserved: 0 };

    for (const canonical of CANONICAL_BRANDS) {
        const normalizedName = normalizeBrandName(canonical.name);
        const resolvedReference = aliasByNormalizedName.get(normalizedName) ?? brandByNormalizedName.get(normalizedName);
        const resolved = resolvedReference && brandById.get(resolvedReference.id);
        if (resolved && resolved.name !== canonical.name) {
            collisions.push(`${canonical.name} resolves to existing ${resolved.name}`);
            continue;
        }
        if (!resolved) {
            creates.push(canonical);
            plan.CREATE += 1;
            continue;
        }
        const data = changedBrandData(resolved, canonical);
        if (Object.keys(data).length > 0) {
            updates.push({ existing: resolved, data });
            plan.UPDATE += 1;
        }
        if (resolved.isMovementMaker && !canonical.isMovementMaker) plan.movementMakerTruePreserved += 1;
    }

    const aliasRecords = canonicalAliasRecords();
    for (const record of aliasRecords) {
        const existing = aliasByNormalizedName.get(record.normalizedAlias);
        if (existing && existing.name !== record.brandName) {
            collisions.push(`${record.alias} (${record.normalizedAlias}) belongs to ${existing.name}`);
        } else if (existing) {
            plan.SKIP += 1;
        } else {
            plan.aliasCreate += 1;
        }
    }
    if (collisions.length) throw new Error(`alias or brand collisions:\n${collisions.join("\n")}`);

    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", canonicalBrandCount: CANONICAL_BRANDS.length, ...plan, conflicts: collisions.length }, null, 2));
    if (!apply) return;

    await prisma.$transaction(async (tx) => {
        if (creates.length) {
            await tx.brand.createMany({
                data: creates.map((brand) => ({ name: brand.name, nameEn: brand.nameEn, nameJp: brand.nameJp, brandKind: brand.brandKind, isWatchBrand: brand.isWatchBrand, isMovementMaker: brand.isMovementMaker })),
                skipDuplicates: true,
            });
        }
        await Promise.all(updates.map(({ existing, data }) => tx.brand.update({ where: { id: existing.id }, data })));

        const savedBrands = await tx.brand.findMany({
            where: { name: { in: CANONICAL_BRANDS.map((brand) => brand.name) } },
            select: { id: true, name: true },
        });
        const brandIdByName = new Map(savedBrands.map((brand) => [brand.name, brand.id]));
        if (brandIdByName.size !== CANONICAL_BRANDS.length) throw new Error(`expected ${CANONICAL_BRANDS.length} canonical brands, found ${brandIdByName.size}`);

        const aliasesToCreate = aliasRecords
            .filter((record) => !aliasByNormalizedName.has(record.normalizedAlias))
            .map((record) => ({ brandId: brandIdByName.get(record.brandName)!, alias: record.alias, normalizedAlias: record.normalizedAlias }));
        if (aliasesToCreate.length) await tx.brandAlias.createMany({ data: aliasesToCreate, skipDuplicates: true });
    }, { maxWait: 10_000, timeout: 120_000 });
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(async () => { await prisma?.$disconnect(); });
