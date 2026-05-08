import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const webSuppliers = [
  {
    name: 'ヤフオク',
    url: 'https://auctions.yahoo.co.jp/search/search?p={query}',
  },
  {
    name: 'メルカリ',
    url: 'https://www.mercari.com/jp/search/?keyword={query}',
  },
  {
    name: 'Watch Parts Market',
    url: 'https://www.watch-parts-market.com/search?keyword={query}',
  },
  {
    name: 'eBay',
    url: 'https://www.ebay.com/sch/i.html?_nkw={query}',
  },
  {
    name: 'AliExpress',
    url: 'https://www.aliexpress.com/wholesale?SearchText={query}',
  },
  {
    name: 'Cousins UK',
    url: 'https://www.cousinsuk.com/search/products?q={query}',
  },
  {
    name: 'WATCH MATERIAL',
    url: 'https://www.watchmaterial.com/search.php?search_query={query}&section=product',
  },
]

const storeSuppliers = [
  {
    name: '中村時計材料店',
    url: null,
  },
]

async function main() {
  if (webSuppliers.length !== 7) {
    throw new Error(`Expected 7 web suppliers, got ${webSuppliers.length}`)
  }

  for (const supplier of webSuppliers) {
    await prisma.supplier.upsert({
      where: { name: supplier.name },
      update: {
        url: supplier.url,
        isOnline: true,
      },
      create: {
        name: supplier.name,
        url: supplier.url,
        isOnline: true,
      },
    })
  }

  for (const supplier of storeSuppliers) {
    await prisma.supplier.upsert({
      where: { name: supplier.name },
      update: {
        url: supplier.url,
        isOnline: false,
      },
      create: {
        name: supplier.name,
        url: supplier.url,
        isOnline: false,
      },
    })
  }

  console.log(`Web suppliers upserted: ${webSuppliers.length}`)
  console.log(`Store suppliers upserted: ${storeSuppliers.length}`)
  console.log(`Suppliers upserted: ${webSuppliers.length + storeSuppliers.length}`)
  console.log('Done.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
