import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    // 1. Create Brands
    const rolex = await prisma.brand.upsert({
        where: { name: 'ROLEX' },
        update: {},
        create: { name: 'ROLEX', kana: 'ロレックス', initialChar: 'R' },
    })

    // 2. Create Models
    const daytona = await prisma.model.create({
        data: {
            brandId: rolex.id,
            name: 'Daytona',
            refNumber: '116500LN',
        }
    })

    // 3. Create Calibers (with Work Time)
    const c4130 = await prisma.caliber.create({
        data: {
            brandId: rolex.id,
            name: '4130',
            movementType: 'mechanical_chrono',
            standardWorkMinutes: 120, // 2 hours
        }
    })

    // 4. Create Customers with Ranks
    const vipCustomer = await prisma.customer.create({
        data: {
            type: 'individual',
            name: 'VIP Tanaka',
            email: 'tanaka@vip.com',
            rank: 5, // High rank
        }
    })

    const normalCustomer = await prisma.customer.create({
        data: {
            type: 'individual',
            name: 'Normal Suzuki',
            email: 'suzuki@normal.com',
            rank: 1, // Normal rank
        }
    })

    console.log({ rolex, daytona, c4130, vipCustomer, normalCustomer })
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
