import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canApplyPartsOrderStatus, getRepairStatusFromOrderStatuses, type RepairPartsOrderStatus } from '@/lib/repair-parts-status'

async function addStatusLogIfLatestChanged(repairId: number, status: string) {
  const latest = await prisma.repairStatusLog.findFirst({
    where: { repairId },
    orderBy: { id: 'desc' },
  })

  if (latest?.status !== status) {
    await prisma.repairStatusLog.create({
      data: { repairId, status },
    })
  }
}

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
    if (status === 'assigned') {
      const activeOrders = await prisma.orderRequest.count({
        where: {
          repairId: order.repairId,
          status: { in: ['pending', 'ordered', 'received'] },
        },
      })

      if (activeOrders === 0) {
        const repairForStatus = await prisma.repair.findUnique({
          where: { id: order.repairId },
          select: { status: true },
        })

        if (repairForStatus?.status === '部品入荷済み') {
          await prisma.repair.update({
            where: { id: order.repairId },
            data: { status: '作業待ち' },
          })
          await addStatusLogIfLatestChanged(order.repairId, '作業待ち')
        }
      }

      return NextResponse.json(order)
    }

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

    const repairForStatus = await prisma.repair.findUnique({
      where: { id: order.repairId },
      select: { status: true },
    })
    if (nextRepairStatus && canApplyPartsOrderStatus(repairForStatus?.status)) {
      await prisma.repair.update({
        where: { id: order.repairId },
        data: { status: nextRepairStatus }
      })
      await addStatusLogIfLatestChanged(order.repairId, nextRepairStatus)
    }
  }

  return NextResponse.json(order)
}
