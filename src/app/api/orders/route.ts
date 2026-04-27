import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRepairStatusFromOrderStatuses, type RepairPartsOrderStatus } from '@/lib/repair-parts-status'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const repairId = searchParams.get('repairId')
  const orders = await prisma.orderRequest.findMany({
    where: repairId
      ? { repairId: Number(repairId) }
      : { status: { in: ['pending', 'ordered', 'received'] } },
    include: {
      partsMaster: {
        select: {
          nameJp: true,
          nameEn: true,
          partRefs: true,
          cousinsNumber: true,
        }
      },
      supplier: { select: { name: true } },
      repair: {
        select: {
          inquiryNumber: true,
          customer: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  })
  return NextResponse.json(orders)
}

export async function POST(req: Request) {
  const { repairId, partsMasterId, quantity } = await req.json()

  if (!repairId || !partsMasterId) {
    return NextResponse.json({ error: 'repairId and partsMasterId are required' }, { status: 400 })
  }

  const master = await prisma.partsMaster.findUnique({
    where: { id: Number(partsMasterId) },
  })

  if (!master) {
    return NextResponse.json({ error: 'partsMaster not found' }, { status: 404 })
  }

  const existing = await prisma.orderRequest.findFirst({
    where: {
      repairId: Number(repairId),
      partsMasterId: Number(partsMasterId),
      status: { in: ['pending', 'ordered'] },
    },
    include: {
      supplier: { select: { name: true } },
      repair: {
        select: {
          inquiryNumber: true,
          customer: { select: { name: true } }
        }
      },
      partsMaster: {
        select: {
          nameJp: true,
          nameEn: true,
          partRefs: true,
          cousinsNumber: true,
        }
      }
    }
  })

  if (existing) {
    const nextQuantity = (existing.quantity || 1) + (Number(quantity) || 1)
    const updated = await prisma.orderRequest.update({
      where: { id: existing.id },
      data: { quantity: nextQuantity },
      include: {
        supplier: { select: { name: true } },
        repair: {
          select: {
            inquiryNumber: true,
            customer: { select: { name: true } }
          }
        },
        partsMaster: {
          select: {
            nameJp: true,
            nameEn: true,
            partRefs: true,
            cousinsNumber: true,
          }
        }
      }
    })
    const repairOrders = await prisma.orderRequest.findMany({
      where: {
        repairId: Number(repairId),
        status: { in: ['pending', 'ordered', 'received'] },
      },
      select: { status: true }
    })
    const nextRepairStatus = getRepairStatusFromOrderStatuses(
      repairOrders.map(order => order.status as RepairPartsOrderStatus)
    )
    if (nextRepairStatus) {
      await prisma.repair.update({
        where: { id: Number(repairId) },
        data: { status: nextRepairStatus }
      })
    }
    return NextResponse.json({ order: updated, created: false, updated: true })
  }

  const order = await prisma.orderRequest.create({
    data: {
      repairId: Number(repairId),
      partsMasterId: Number(partsMasterId),
      quantity: Number(quantity) || 1,
      partNameJp: master.nameJp,
      partNameEn: master.nameEn ?? null,
      partRefs: master.partRefs ?? null,
      cousinsNumber: master.cousinsNumber ?? null,
      supplierId: master.supplierId ?? null,
      searchWordJp: master.nameJp,
      searchWordEn: master.nameEn ?? null,
      status: 'pending',
    },
    include: {
      supplier: { select: { name: true } },
      repair: {
        select: {
          inquiryNumber: true,
          customer: { select: { name: true } }
        }
      },
      partsMaster: {
        select: {
          nameJp: true,
          nameEn: true,
          partRefs: true,
          cousinsNumber: true,
        }
      }
    }
  })

  const repairOrders = await prisma.orderRequest.findMany({
    where: {
      repairId: Number(repairId),
      status: { in: ['pending', 'ordered', 'received'] },
    },
    select: { status: true }
  })
  const nextRepairStatus = getRepairStatusFromOrderStatuses(
    repairOrders.map(existingOrder => existingOrder.status as RepairPartsOrderStatus)
  )
  if (nextRepairStatus) {
    await prisma.repair.update({
      where: { id: Number(repairId) },
      data: { status: nextRepairStatus }
    })
  }

  return NextResponse.json({ order, created: true, updated: false })
}
