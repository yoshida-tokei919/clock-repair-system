import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';

async function main() {
    const url = process.env.RECOVERY_DATABASE_URL;
    if (!url) throw new Error('RECOVERY_DATABASE_URL is required; .env is never used.');
    const target = new URL(url);
    if (target.hostname !== '127.0.0.1' || target.port !== '55435'
        || !['/clock_recovery', '/clock_recovery_current'].includes(target.pathname)) {
        throw new Error('Only the disposable recovery database is allowed.');
    }
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
        const migrations = await db.$queryRaw<Array<{ migration_name: string; finished: boolean }>>`
            SELECT migration_name, finished_at IS NOT NULL AS finished
            FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name`;
        assert.deepEqual(migrations, [
            { migration_name: '0_production_legacy_baseline', finished: true },
            { migration_name: '20260904_add_estimate_item_public_case_snapshots', finished: true },
        ]);
        const counts = {
            repairs: await db.repair.count(),
            repairLineItems: await db.repairLineItem.count(),
            workCategories: await db.repairWorkCategory.count(),
            workActions: await db.repairWorkAction.count(),
            workNames: await db.repairWorkName.count(),
            pricingRules: await db.pricingRule.count(),
            partsMasters: await db.partsMaster.count(),
            publicCases: await db.publicCase.count(),
            fmp: await db.publicCase.count({ where: { sourceType: 'FMP' } }),
            webApp: await db.publicCase.count({ where: { sourceType: 'WEB_APP' } }),
        };
        if (target.pathname === '/clock_recovery_current') {
            assert.equal(counts.publicCases, 2914);
            assert.equal(counts.fmp, 2914);
            assert.equal(counts.webApp, 0);
            assert.equal(await db.publicCase.count({ where: {
                sourceType: 'FMP', reviewStatus: 'APPROVED', b2cPublishStatus: 'PUBLISHED',
                b2bPublishStatus: 'HIDDEN', showPriceB2c: false,
            } }), 2914);
            (globalThis as any).prisma = db;
            const { getB2CPublicCasesForGallery, getB2CPublicCaseDetail, getLatestB2CPublicCasesForHome } =
                await import('../src/lib/public-cases');
            const gallery = await getB2CPublicCasesForGallery();
            assert.ok(gallery.length > 0);
            assert.ok(await getB2CPublicCaseDetail(String(gallery[0].id)));
            assert.equal((await getLatestB2CPublicCasesForHome(10)).length, 10);
        }
        // Read actual recovered fields and relations through the generated client.
        await db.repair.findFirst({ include: {
            estimate: { include: { items: true } }, repairLineItems: { include: {
                repairWorkCategory: true, repairWorkAction: true, targetPartName: true,
            } }, movementCaliber: true, baseMovementCaliber: true,
        } });
        await db.pricingRule.findFirst({ include: { repairWorkName: true, targetPartName: true } });
        console.log(JSON.stringify({ migrations, counts, generatedClientRelations: 'PASS' }, null, 2));
    } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
