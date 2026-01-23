
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const photos = await prisma.repairPhoto.findMany({
        take: 10,
        orderBy: { id: 'desc' },
        include: { repair: { select: { id: true, status: true } } }
    });
    console.log("Latest 10 photos:", JSON.stringify(photos, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
