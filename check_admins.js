const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const admins = await prisma.admin.findMany();
    console.log('Admins in DB:', JSON.stringify(admins, null, 2));
    await prisma.$disconnect();
}

check();
