import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const repairId = Number(params.id)
  const { status } = await req.json()

  // ステータス更新（includeなし）
  const repair = await prisma.repair.update({
    where: { id: repairId },
    data: { status },
  })

  // 「作業待ち」移行時のみ在庫チェック
  if (status === '作業待ち') {
    const estimate = await prisma.estimate.findUnique({
      where: { repairId },
      include: {
        items: {
          include: { partsMaster: true }
        }
      }
    })

    const warnings: {
      partName: string
      required: number
      stock: number
      orderRequestId: number
    }[] = []

    const items = estimate?.items ?? []

    for (const item of items) {
      if (!item.partsMasterId || !item.partsMaster) continue

      const required = item.quantity ?? 1
      const stock = item.partsMaster.stockQuantity

      if (stock < required) {
        // 発注リストに追加（重複チェック）
        const existing = await prisma.orderRequest.findFirst({
          where: {
            partsMasterId: item.partsMasterId,
            repairId,
            status: { in: ['pending', 'ordered'] }
          }
        })

        let orderRequest
        if (!existing) {
          orderRequest = await prisma.orderRequest.create({
            data: {
              partsMasterId: item.partsMasterId,
              partNameJp: item.partsMaster.nameJp,
              partNameEn: item.partsMaster.nameEn ?? null,
              partRefs: item.partsMaster.partRefs ?? null,
              cousinsNumber: item.partsMaster.cousinsNumber ?? null,
              quantity: required,
              supplierId: item.partsMaster.supplierId ?? null,
              searchWordJp: item.partsMaster.nameJp,
              searchWordEn: item.partsMaster.nameEn ?? null,
              repairId,
              status: 'pending',
            }
          })
        } else {
          orderRequest = existing
        }

        warnings.push({
          partName: item.partsMaster.nameJp,
          required,
          stock,
          orderRequestId: orderRequest.id,
        })
      } else {
        // 在庫あり→在庫数を減らす
        await prisma.partsMaster.update({
          where: { id: item.partsMasterId },
          data: { stockQuantity: { decrement: required } }
        })
      }
    }

    return NextResponse.json({ repair, warnings })
  }

  return NextResponse.json({ repair, warnings: [] })
}
