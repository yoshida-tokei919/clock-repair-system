const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
    try {
        const count = await prisma.repair.count();
        console.log('Repair count:', count);
        const brands = await prisma.brand.findMany();
        console.log('Brands:', brands.length);
    } catch (e) {
        console.error('DB Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}
main();
