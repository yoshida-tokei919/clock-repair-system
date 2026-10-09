import bcrypt from 'bcryptjs'
import { Prisma, PrismaClient } from '@prisma/client'
import { validateNewAdminPassword } from '../src/lib/admin-password'

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const name = process.env.ADMIN_NAME?.trim() || '管理者'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.')
  }
  const password = validateNewAdminPassword(process.env.ADMIN_PASSWORD)
  const passwordHash = await bcrypt.hash(password, 12)

  await prisma.$transaction(async (tx) => {
    if (await tx.admin.findFirst({ select: { id: true } })) {
      throw new Error('Admin already exists. Bootstrap is only for a database with no Admin.')
    }
    await tx.admin.create({ data: { name, email, passwordHash, role: 'admin' } })
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  console.log('Admin bootstrap completed.')
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Admin bootstrap failed.')
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
