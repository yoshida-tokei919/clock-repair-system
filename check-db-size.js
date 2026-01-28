const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log('--- Database Size Check ---');

        // 1. Overall Database Size
        const dbSize = await prisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) as size`;
        console.log(`Current Database Total Size: ${dbSize[0].size}`);

        // 2. Size by Table (Top ones)
        const tableSizes = await prisma.$queryRaw`
            SELECT 
                relname as table_name, 
                pg_size_pretty(pg_total_relation_size(relid)) as size_pretty,
                pg_total_relation_size(relid) as size_bytes
            FROM pg_catalog.pg_statio_user_tables 
            ORDER BY pg_total_relation_size(relid) DESC
            LIMIT 10
        `;

        console.log('\n--- Table Sizes ---');
        tableSizes.forEach(t => {
            console.log(`${t.table_name.padEnd(20)}: ${t.size_pretty}`);
        });

        // 3. Specifically check Photo table content size if possible
        const photoDataSize = await prisma.$queryRaw`SELECT pg_size_pretty(sum(pg_column_size("storageKey"))) as data_size FROM "RepairPhoto"`;
        if (photoDataSize && photoDataSize[0]) {
            console.log(`\nActual Image Data (storageKey) Sum: ${photoDataSize[0].data_size}`);
        }

    } catch (e) {
        console.error('Error during check:', e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
