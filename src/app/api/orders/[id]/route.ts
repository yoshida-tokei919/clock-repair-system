import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRepairStatusFromOrderStatuses, type RepairPartsOrderStatus } from '@/lib/repair-parts-status'

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

  if (status === 'received' && order.partsMasterId) {
    await prisma.partsMaster.update({
      where: { id: order.partsMasterId },
      data: { stockQuantity: { increment: order.quantity } }
    })
  }

  if (order.repairId) {
    const repairOrders = await prisma.orderRequest.findMany({
      where: {
        repairId: order.repairId,
        status: { in: ['pending', 'ordered', 'received'] }
      },
      select: { status: true }
    })

    const nextRepairStatus = getRepairStatusFromOrderStatuses(
      repairOrders.map(o => o.status as RepairPartsOrderStatus)
    )

    if (nextRepairStatus) {
      await prisma.repair.update({
        where: { id: order.repairId },
        data: { status: nextRepairStatus }
      })
    }
  }

  return NextResponse.json(order)
}
