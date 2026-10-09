import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AdminPasswordInputError, validateCurrentAdminPassword, validateNewAdminPassword } from '@/lib/admin-password'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await prisma.admin.findUnique({ where: { email }, select: { id: true, role: true, passwordHash: true } })
  if (!admin || admin.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const currentPassword = validateCurrentAdminPassword(body?.currentPassword)
    const newPassword = validateNewAdminPassword(body?.newPassword)
    if (currentPassword === newPassword) throw new AdminPasswordInputError('現在とは異なるパスワードを設定してください。')

    if (!await bcrypt.compare(currentPassword, admin.passwordHash)) {
      return NextResponse.json({ error: '現在のパスワードを確認してください。' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    const updated = await prisma.admin.updateMany({
      where: { id: admin.id, passwordHash: admin.passwordHash, role: 'admin' },
      data: { passwordHash },
    })
    if (updated.count !== 1) {
      return NextResponse.json({ error: '認証情報が変更されています。再ログインしてください。' }, { status: 409 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AdminPasswordInputError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof SyntaxError) return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 })
    console.error('Admin password update failed')
    return NextResponse.json({ error: 'パスワードを変更できませんでした。' }, { status: 500 })
  }
}
