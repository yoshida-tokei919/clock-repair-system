const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const brands = await prisma.brand.findMany({ take: 5 });
    console.log('Brands sample:', JSON.stringify(brands, null, 2));
    await prisma.$disconnect();
}

check();
