import { PrismaClient } from "@prisma/client";
import { CANONICAL_BRANDS } from "../src/lib/canonical-brands";
import { normalizeBrandName, resolveBrand } from "../src/lib/master-normalize";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

function aliasesFor(brand: typeof CANONICAL_BRANDS[number]) {
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

async function main() {
    validateCanonicalAliases();
    const collisions: string[] = [];
    const plan: string[] = [];

    for (const brand of CANONICAL_BRANDS) {
        const resolved = await resolveBrand(prisma as any, brand.name);
        if (resolved && resolved.name !== brand.name) {
            collisions.push(`${brand.name} resolves to existing ${resolved.name}`);
            continue;
        }
        plan.push(`${resolved ? "update" : "create"}: ${brand.name}`);

        for (const alias of aliasesFor(brand)) {
            const normalizedAlias = normalizeBrandName(alias);
            const existingAlias = await prisma.brandAlias.findUnique({ where: { normalizedAlias }, include: { brand: true } });
            if (existingAlias && existingAlias.brand.name !== brand.name) {
                collisions.push(`${alias} (${normalizedAlias}) belongs to ${existingAlias.brand.name}`);
            }
        }
    }

    if (collisions.length) throw new Error(`alias or brand collisions:\n${collisions.join("\n")}`);
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", plan, canonicalBrandCount: CANONICAL_BRANDS.length }, null, 2));
    if (!apply) return;

    await prisma.$transaction(async (tx) => {
        for (const brand of CANONICAL_BRANDS) {
            const saved = await tx.brand.upsert({
                where: { name: brand.name },
                create: { name: brand.name, nameEn: brand.nameEn, nameJp: brand.nameJp, brandKind: brand.brandKind, isWatchBrand: brand.isWatchBrand, isMovementMaker: brand.isMovementMaker },
                update: { nameEn: brand.nameEn, nameJp: brand.nameJp, brandKind: brand.brandKind, isWatchBrand: brand.isWatchBrand, isMovementMaker: brand.isMovementMaker },
            });
            for (const alias of aliasesFor(brand)) {
                const normalizedAlias = normalizeBrandName(alias);
                await tx.brandAlias.upsert({
                    where: { normalizedAlias },
                    create: { brandId: saved.id, alias, normalizedAlias },
                    update: { alias, brandId: saved.id },
                });
            }
        }
    });
}

main()
    .catch((error) => { console.error(error); process.exitCode = 1; })
    .finally(async () => { await prisma.$disconnect(); });
