// prisma/seed.ts
import { PrismaClient, RepairWorkType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding data...')

    // 0. Repair work action master
    const repairWorkActions = [
        { name: 'exchange',        displayName: '交換',   sortOrder: 10  },
        { name: 'repair',          displayName: '修理',   sortOrder: 20  },
        { name: 'adjust',          displayName: '調整',   sortOrder: 30  },
        { name: 'correction',      displayName: '修正',   sortOrder: 40  },
        { name: 'polish',          displayName: '研磨',   sortOrder: 50  },
        { name: 'clean',           displayName: '洗浄',   sortOrder: 60  },
        { name: 'oil',             displayName: '注油',   sortOrder: 70  },
        { name: 'make',            displayName: '製作',   sortOrder: 80  },
        { name: 'install',         displayName: '取付',   sortOrder: 90  },
        { name: 'remove',          displayName: '除去',   sortOrder: 100 },
        { name: 'hole_tightening', displayName: '穴締め', sortOrder: 110 },
        { name: 'staking',         displayName: 'かしめ', sortOrder: 120 },
    ]
    for (const action of repairWorkActions) {
        await prisma.repairWorkAction.upsert({
            where: { name: action.name },
            update: {
                displayName: action.displayName,
                sortOrder: action.sortOrder,
                isActive: true,
            },
            create: {
                ...action,
                isActive: true,
            },
        })
    }
    console.log(`Repair work actions seeded: ${repairWorkActions.length}件`)

    // 0. Repair work category master
    const repairWorkCategories = [
        { repairType: RepairWorkType.INTERNAL, name: 'movement',          displayName: 'ムーブメント',             sortOrder: 10  },
        { repairType: RepairWorkType.INTERNAL, name: 'quartz',            displayName: 'クォーツ',                 sortOrder: 20  },
        { repairType: RepairWorkType.INTERNAL, name: 'power_winding',     displayName: '動力・巻上',               sortOrder: 30  },
        { repairType: RepairWorkType.INTERNAL, name: 'train_wheel',       displayName: '輪列',                     sortOrder: 40  },
        { repairType: RepairWorkType.INTERNAL, name: 'escapement',        displayName: '脱進機',                   sortOrder: 50  },
        { repairType: RepairWorkType.INTERNAL, name: 'regulator',         displayName: '調速機',                   sortOrder: 60  },
        { repairType: RepairWorkType.INTERNAL, name: 'hand_setting',      displayName: '針回し',                   sortOrder: 70  },
        { repairType: RepairWorkType.INTERNAL, name: 'calendar',          displayName: 'カレンダー',               sortOrder: 80  },
        { repairType: RepairWorkType.INTERNAL, name: 'automatic_winding', displayName: '自動巻',                   sortOrder: 90  },
        { repairType: RepairWorkType.INTERNAL, name: 'chronograph',       displayName: 'クロノグラフ',             sortOrder: 100 },
        { repairType: RepairWorkType.INTERNAL, name: 'main_plate',        displayName: '地板',                     sortOrder: 110 },
    ]
    for (const category of repairWorkCategories) {
        const existing = await prisma.repairWorkCategory.findFirst({
            where: {
                repairType: category.repairType,
                parentId: null,
                name: category.name,
            },
        })

        if (existing) {
            await prisma.repairWorkCategory.update({
                where: { id: existing.id },
                data: {
                    displayName: category.displayName,
                    sortOrder: category.sortOrder,
                    isActive: true,
                },
            })
        } else {
            await prisma.repairWorkCategory.create({
                data: {
                    ...category,
                    parentId: null,
                    isActive: true,
                },
            })
        }
    }
    console.log(`Repair work categories seeded: ${repairWorkCategories.length}件`)

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
