// prisma/seed.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding data...')

    // 0. Supplier（購入店マスタ）初期データ
    const suppliers = [
        { name: 'Cousins UK',     url: 'https://www.cousinsuk.com', isOnline: true  },
        { name: 'eBay',           url: 'https://www.ebay.com',      isOnline: true  },
        { name: 'AliExpress',     url: 'https://www.aliexpress.com',isOnline: true  },
        { name: 'ヤフオク',        url: 'https://auctions.yahoo.co.jp', isOnline: true },
        { name: 'メルカリ',        url: 'https://www.mercari.com',   isOnline: true  },
        { name: 'Yショッピング',   url: 'https://shopping.yahoo.co.jp', isOnline: true },
        { name: '楽天',           url: 'https://www.rakuten.co.jp', isOnline: true  },
        { name: '激安卸問屋',      url: null,                        isOnline: true  },
        { name: '中村時計材料店',  url: null,                        isOnline: false },
        { name: 'その他',          url: null,                        isOnline: false },
    ]
    for (const s of suppliers) {
        await prisma.supplier.upsert({
            where: { name: s.name },
            update: {},
            create: s,
        })
    }
    console.log(`Suppliers seeded: ${suppliers.length}件`)

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
