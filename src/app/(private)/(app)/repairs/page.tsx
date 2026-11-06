import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { RepairsTableClient } from "@/components/repairs/RepairsTableClient";
import { RepairListFilters } from "@/components/repairs/RepairListFilters";
import { PlusCircle } from "lucide-react";
import { isR2RepairPhotoKey } from "@/lib/r2-repair-photos";
import { selectRepairListPhoto } from "@/lib/repair-list-photo";
import { buildRepairListWhere, normalizeRepairListParams, repairListPage, repairListUrl, REPAIR_LIST_PAGE_SIZE, type RawParams } from "@/lib/repair-list-filters";
export const dynamic = "force-dynamic";

export default async function RepairsPage({
    searchParams,
}: {
    searchParams: Promise<RawParams>;
}) {
    const filters = normalizeRepairListParams(await searchParams);
    const where = buildRepairListWhere(filters);
    const [count, customers, brands] = await Promise.all([
        prisma.repair.count({ where }),
        prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
        prisma.brand.findMany({ where: { isWatchBrand: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const pagination = repairListPage(filters.page, count);
    const visiblePages = [...new Set([1, pagination.totalPages,
        pagination.currentPage - 2, pagination.currentPage - 1, pagination.currentPage,
        pagination.currentPage + 1, pagination.currentPage + 2,
    ])].filter(page => page >= 1 && page <= pagination.totalPages).sort((a, b) => a - b);
    const repairs = await prisma.repair.findMany({
        where,
        orderBy: { id: "desc" },
        include: {
            customer: { select: { id: true, name: true, type: true, defaultShippingCarrierCode: true,
                defaultShippingServiceCode: true, defaultShippingSize: true, defaultShippingFee: true } },
            watch: {
                select: {
                    serialNumber: true,
                    modelNameInput: true,
                    brand: { select: { name: true } },
                    model: { select: { name: true } },
                    reference: { select: { name: true } },
                    caseReference: { select: { name: true } },
                }
            },
            estimate: { select: { totalAmount: true, items: { orderBy: { id: "asc" }, select: { id: true, itemName: true, quantity: true, unitPrice: true, b2cDisplayNameSnapshot: true } } } },
            logs: { where: { status: "承認待ち" }, orderBy: [{ changedAt: "desc" }, { id: "desc" }], take: 1, select: { changedAt: true } },
            deliveryNote:     { select: { id: true, slipNumber: true } },
            invoice:          { select: { id: true, invoiceNumber: true } },
            estimateDocument: { select: { id: true, estimateNumber: true } },
            warranty:         { select: { id: true, warrantyNumber: true } },
            photos: { orderBy: { id: "desc" }, take: 1, select: { id: true, storageKey: true } },
        },
        skip: pagination.skip,
        take: REPAIR_LIST_PAGE_SIZE,
    });
    const repairIds = repairs.map((repair) => repair.id);
    const frontPhotos = repairIds.length ? await prisma.repairPhoto.findMany({
        where: { repairId: { in: repairIds }, category: "FRONT" },
        select: { id: true, repairId: true, stage: true, storageKey: true },
    }) : [];
    const frontPhotosByRepairId = new Map<number, typeof frontPhotos>();
    for (const photo of frontPhotos) {
        const photos = frontPhotosByRepairId.get(photo.repairId) ?? [];
        photos.push(photo);
        frontPhotosByRepairId.set(photo.repairId, photos);
    }
    let unreadMessages: { id: number; repairId: number; body: string; createdAt: Date }[] = [];
    if (repairIds.length) {
        try {
            unreadMessages = await prisma.$queryRaw<{ id: number; repairId: number; body: string; createdAt: Date }[]>`
            SELECT DISTINCT ON ("repairId") "id", "repairId", "body", "createdAt"
            FROM "RepairCustomerMessage"
            WHERE "repairId" IN (${Prisma.join(repairIds)})
              AND "readAt" IS NULL
              AND "senderType" = 'partner'
            ORDER BY "repairId", "createdAt" DESC
          `;
        } catch (error) {
            console.warn("RepairCustomerMessage table is not available yet.", error);
        }
    }
    const unreadMessageByRepairId = new Map(unreadMessages.map((message) => [message.repairId, message]));
    const repairsWithMessages = repairs.map((repair) => {
        const { photos, ...repairData } = repair;
        const unreadMessage = unreadMessageByRepairId.get(repair.id);
        const selectedPhoto = selectRepairListPhoto(photos[0], frontPhotosByRepairId.get(repair.id) ?? []);
        const photo = selectedPhoto
            ? isR2RepairPhotoKey(selectedPhoto.storageKey)
                ? `/api/repair-photos/${selectedPhoto.id}`
                : /^(https?:|data:|blob:)/i.test(selectedPhoto.storageKey)
                    ? selectedPhoto.storageKey
                    : null
            : null;
        return {
            ...repairData,
            customerMessages: unreadMessage ? [unreadMessage] : [],
            photo,
        };
    });

    return (
        <div className="min-w-0 flex-1 space-y-4 p-4 pt-6 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-3xl font-bold tracking-tight">修理案件一覧</h2>
                <div className="flex flex-wrap items-center gap-2">
                    <Link href="/repairs/b2b-intake">
                        <Button variant="outline">B2B一括受付</Button>
                    </Link>
                    <Link href="/repairs/new">
                        <Button>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            新規修理登録
                        </Button>
                    </Link>
                </div>
            </div>

            <RepairListFilters filters={filters} customers={customers} brands={brands} count={count} />

            {/* Data Table */}
            <RepairsTableClient key={repairListUrl(filters, pagination.currentPage)} repairs={repairsWithMessages} />
            <nav aria-label="修理案件のページ移動" className="flex flex-wrap items-center justify-center gap-2 text-sm">
                {pagination.currentPage > 1 && <Link className="rounded border px-3 py-2" href={repairListUrl(filters, pagination.currentPage - 1)}>前へ</Link>}
                {visiblePages.map(page => <Link key={page} className="rounded border px-3 py-2" aria-current={page === pagination.currentPage ? "page" : undefined} href={repairListUrl(filters, page)}>{page}</Link>)}
                {pagination.currentPage < pagination.totalPages && <Link className="rounded border px-3 py-2" href={repairListUrl(filters, pagination.currentPage + 1)}>次へ</Link>}
                <span>{pagination.currentPage} / {pagination.totalPages} ページ</span>
            </nav>
        </div>
    );
}
