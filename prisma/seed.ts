// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding data...')

    // 1. Create Admin
    const admin = await prisma.admin.upsert({
        where: { email: 'admin@yoshida-watch.com' },
        update: {},
        create: {
            name: 'Admin User',
            email: 'admin@yoshida-watch.com',
            passwordHash: 'hashed_password_here', // In future use bcrypt
            role: 'admin',
        },
    })
    console.log({ admin })

    // 2. Create Partners (F-01/F-10 Enhancement)
    const partners = [
        { name: 'TRUST', prefix: 'T', currentSeq: 20260091 },
        { name: 'J KAMER', prefix: 'JK', currentSeq: 50 },
        { name: 'EVANCE', prefix: 'E', currentSeq: 10 },
        { name: 'COMMIT', prefix: 'C', currentSeq: 0 },
        { name: 'QUAKE', prefix: 'Q', currentSeq: 0 },
        { name: 'A-WATCH', prefix: 'A', currentSeq: 0 },
    ]

    for (const p of partners) {
        // Only create if not exists
        const existing = await prisma.customer.findFirst({
            where: { name: p.name, isPartner: true }
        });

        if (!existing) {
            const partner = await prisma.customer.create({
                data: {
                    type: 'business',
                    isPartner: true,
                    rank: 5,
                    name: p.name,
                    companyName: p.name,
                    prefix: p.prefix,
                    currentSeq: p.currentSeq,
                },
            })
            console.log(`Created partner: ${partner.name} (Prefix: ${partner.prefix})`)
        }
    }

    // 3. Create Brands (Master Data)
    const brands = [
        { name: 'ROLEX', nameEn: 'ROLEX', nameJp: 'ロレックス' },
        { name: 'OMEGA', nameEn: 'OMEGA', nameJp: 'オメガ' },
        { name: 'SEIKO', nameEn: 'SEIKO', nameJp: 'セイコー' },
        { name: 'CARTIER', nameEn: 'CARTIER', nameJp: 'カルティエ' },
    ]

    for (const b of brands) {
        await prisma.brand.upsert({
            where: { name: b.name },
            update: {},
            create: b,
        })
    }

    console.log('Seeding finished.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
