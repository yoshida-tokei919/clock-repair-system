import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { RepairEntryForm } from "@/components/repairs/RepairEntryForm";

export const dynamic = "force-dynamic";

export default async function RepairDetailPage({ params }: { params: { id: string } }) {
    const repairId = parseInt(params.id);
    if (isNaN(repairId)) return notFound();

    const repair = await prisma.repair.findUnique({
        where: { id: repairId },
        include: {
            customer: true,
            watch: {
                include: {
                    brand: true,
                    model: true,
                    caliber: true,
                    reference: true
                }
            },
            estimate: {
                include: { items: { include: { partsMaster: { select: { grade: true, notes1: true, notes2: true, partRefs: true, cousinsNumber: true, stockQuantity: true, supplier: { select: { name: true } } } } } } }
            },
            orderRequests: {
                select: { id: true, partsMasterId: true, quantity: true, status: true }
            },
            photos: true,
            logs: {
                orderBy: { changedAt: 'asc' },
                select: { status: true, changedAt: true }
            },
            // 書類タブ用：発行済み帳票への参照
            estimateDocument: {
                select: { id: true, estimateNumber: true }
            },
            deliveryNote: {
                select: { id: true, slipNumber: true }
            },
            invoice: {
                select: { id: true, invoiceNumber: true }
            },
            warranty: {
                select: { id: true, warrantyNumber: true }
            }
        }
    });

    if (!repair) return notFound();

    // ステータスログをUIキー → 日付のマップに変換
    const labelToKey: Record<string, string> = {
        '受付': 'reception',
        '見積中': 'diagnosing',
        '承認待ち': 'approval_wait',
        '部品待ち(未注文)': 'parts_wait',
        '部品待ち(注文済み)': 'parts_wait_ordered',
        '部品入荷済み': 'parts_arrived',
        '作業待ち': 'work_wait',
        '作業中': 'in_progress',
        '作業完了': 'work_completed',
        '納品済み': 'delivered',
        'キャンセル': 'canceled',
        '保留': 'on_hold',
    };
    const statusLog: Record<string, string> = {};
    repair.logs.forEach(log => {
        const key = labelToKey[log.status] || log.status;
        // 同一ステータスが複数ある場合は最新を使用
        statusLog[key] = log.changedAt.toLocaleDateString("ja-JP");
    });

    // JSON.parse(JSON.stringify(...)) で Date オブジェクトを文字列化してクライアントへ渡す
    const initialData = JSON.parse(JSON.stringify({
        ...repair,
        statusLog,
        // 帳票情報をフラットに渡す
        issuedEstimate: repair.estimateDocument
            ? { id: repair.estimateDocument.id, number: repair.estimateDocument.estimateNumber }
            : null,
        issuedDelivery: repair.deliveryNote
            ? { id: repair.deliveryNote.id, number: repair.deliveryNote.slipNumber }
            : null,
        issuedInvoice: repair.invoice
            ? { id: repair.invoice.id, number: repair.invoice.invoiceNumber }
            : null,
        issuedWarranty: repair.warranty
            ? { id: repair.warranty.id, number: repair.warranty.warrantyNumber }
            : null,
    }));

    return (
        <div className="bg-zinc-100 min-h-screen">
            <RepairEntryForm mode="view" initialData={initialData} />
        </div>
    );
}
