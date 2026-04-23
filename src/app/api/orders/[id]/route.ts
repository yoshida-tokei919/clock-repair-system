import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const orderId = Number(params.id)
  const { status } = await req.json()

  const order = await prisma.orderRequest.update({
    where: { id: orderId },
    data: {
      status,
      orderedAt: status === 'ordered' ? new Date() : undefined,
      receivedAt: status === 'received' ? new Date() : undefined,
    },
    include: {
      repair: true,
    }
  })

  // 入荷済み時の処理
  if (status === 'received') {
    // 在庫+1
    if (order.partsMasterId) {
      await prisma.partsMaster.update({
        where: { id: order.partsMasterId },
        data: { stockQuantity: { increment: order.quantity } }
      })
    }

    // 同じカルテの全OrderRequestが全部receivedか確認
    if (order.repairId) {
      const remaining = await prisma.orderRequest.count({
        where: {
          repairId: order.repairId,
          status: { not: 'received' },
          id: { not: orderId }
        }
      })

      // 全部received → 案件ステータスを「部品入荷済み」に更新
      if (remaining === 0) {
        await prisma.repair.update({
          where: { id: order.repairId },
          data: { status: '部品入荷済み' }
        })
      }
    }
  }

  // 発注済み時：案件ステータスを「部品待ち(注文済み)」に更新
  if (status === 'ordered' && order.repairId) {
    await prisma.repair.update({
      where: { id: order.repairId },
      data: { status: '部品待ち(注文済み)' }
    })
  }

  return NextResponse.json(order)
}
