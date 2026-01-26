const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetSequences() {
    console.log('Resetting PostgreSQL sequences to match max(id)...');

    const tables = [
        'Admin', 'Customer', 'Brand', 'Model', 'Caliber', 'WatchReference',
        'Watch', 'Repair', 'RepairStatusLog', 'RepairPhoto', 'PricingRule',
        'Estimate', 'EstimateItem', 'PartsMaster', 'DeliveryNote', 'Invoice', 'EstimateDocument'
    ];

    try {
        for (const table of tables) {
            const result = await prisma.$queryRawUnsafe(`
        SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), coalesce(max(id), 0) + 1, false) FROM "${table}";
      `);
            console.log(`Reset sequence for ${table}`);
        }
        console.log('All sequences reset successfully!');
    } catch (error) {
        console.error('Failed to reset sequences:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetSequences();
