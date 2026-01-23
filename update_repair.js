
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const repair = await prisma.repair.update({
        where: { id: 17 }, // JK-051
        data: { endUserName: 'テストユーザー' }
    });
    console.log('Updated Repair:', repair);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
