
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const repair = await prisma.repair.findFirst({
        where: { inquiryNumber: 'JK-051' },
        select: { id: true, inquiryNumber: true, endUserName: true, customer: true }
    });
    console.log('Repair JK-051:', repair);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
