const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Starting Drill-down Data Seed ---');

    // 1. Brand: ROLEX
    const rolex = await prisma.brand.upsert({
        where: { name: 'ROLEX' },
        update: {},
        create: {
            name: 'ROLEX',
            nameEn: 'ROLEX',
            nameJp: 'ロレックス',
            kana: 'ロレックス'
        }
    });
    console.log('Created Brand:', rolex.name);

    // 2. Caliber: 3135
    const cal3135 = await prisma.caliber.create({
        data: {
            brandId: rolex.id,
            name: '3135',
            nameEn: 'Cal.3135',
            movementType: 'mechanical_simple',
            standardWorkMinutes: 180
        }
    });

    const cal4130 = await prisma.caliber.create({
        data: {
            brandId: rolex.id,
            name: '4130',
            nameEn: 'Cal.4130',
            movementType: 'mechanical_chrono',
            standardWorkMinutes: 300
        }
    });
    console.log('Created Calibers: 3135, 4130');

    // 3. Models (= Refs in this drill-down context)
    const dj16233 = await prisma.model.create({
        data: {
            brandId: rolex.id,
            name: 'DATEJUST 16233',
            nameEn: 'DATEJUST Ref.16233',
            nameJp: 'デイトジャスト',
            refNumber: '16233'
        }
    });

    const sub16610 = await prisma.model.create({
        data: {
            brandId: rolex.id,
            name: 'SUBMARINER 16610',
            nameEn: 'SUBMARINER Ref.16610',
            nameJp: 'サブマリーナ',
            refNumber: '16610'
        }
    });
    console.log('Created Models/Refs: 16233, 16610');

    // 4. Pricing Rules (Internal - Based on Caliber)
    await prisma.pricingRule.create({
        data: {
            brandId: rolex.id,
            caliberId: cal3135.id,
            suggestedWorkName: 'オーバーホール (3135系)',
            minPrice: 30000,
            maxPrice: 45000,
            customerType: 'individual'
        }
    });

    await prisma.pricingRule.create({
        data: {
            brandId: rolex.id,
            caliberId: cal4130.id,
            suggestedWorkName: 'オーバーホール (4130系 デイトナ)',
            minPrice: 50000,
            maxPrice: 75000,
            customerType: 'individual'
        }
    });

    // 5. Pricing Rules (External - Based on Model/Ref)
    await prisma.pricingRule.create({
        data: {
            brandId: rolex.id,
            modelId: dj16233.id,
            suggestedWorkName: 'クリスタル交換 (16233)',
            minPrice: 15000,
            maxPrice: 18000
        }
    });

    await prisma.pricingRule.create({
        data: {
            brandId: rolex.id,
            modelId: rolex.id, // Generic Rolex Polishing
            suggestedWorkName: '新品仕上げ (ロレックス)',
            minPrice: 20000,
            maxPrice: 25000
        }
    });
    console.log('Created Pricing Rules (Internal & External)');

    // 6. Parts Master
    // Internal Part (Caliber based)
    await prisma.partsMaster.create({
        data: {
            brandId: rolex.id,
            caliberId: cal3135.id,
            name: 'ゼンマイ (3135)',
            nameJp: 'ゼンマイ (Cal.3135用)',
            category: 'internal',
            partNumber: '3135-100',
            latestCostYen: 3000,
            retailPrice: 4650, // 3000 * 1.55
            supplier: 'Generic',
            stockQuantity: 10
        }
    });

    // External Part (Model based - we use brandId and notes/name for filtering usually, 
    // but the schema only has brandId/caliberId. We might need modelId in PartsMaster 
    // if we strictly drill down to Ref for parts. 
    // Let's see if we can use name or category for now.)
    await prisma.partsMaster.create({
        data: {
            brandId: rolex.id,
            name: 'サファイアクリスタル (16233用)',
            nameJp: 'サファイアガラス (Ref.16233)',
            category: 'external',
            partNumber: '29-206-C',
            latestCostYen: 8000,
            retailPrice: 12400,
            supplier: 'Original',
            stockQuantity: 2
        }
    });
    console.log('Created Parts Master Data');

    console.log('--- Seed Completed Successfully ---');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
