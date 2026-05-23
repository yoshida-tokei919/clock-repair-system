import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { InvoicePdfActions } from "@/components/invoices/InvoicePdfActions";
export const dynamic = "force-dynamic";

function formatPdfGeneratedAt(date: Date) {
    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

export default async function InvoiceDocumentPage({ params }: { params: { id: string } }) {
    const id = parseInt(params.id);
    if (isNaN(id)) return notFound();

    const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
            customer: true,
        },
    });

    if (!invoice) return notFound();

    const [currentPdfFile] = await prisma.$queryRaw<{
        id: number;
        version: number;
        status: string;
        generatedAt: Date;
        fileName: string;
        hasStorageKey: boolean;
    }[]>`
        SELECT
            f."id",
            f."version",
            f."status",
            f."generatedAt",
            f."fileName",
            LENGTH(f."storageKey") > 0 AS "hasStorageKey"
        FROM "Invoice" i
        JOIN "InvoicePdfFile" f ON f."id" = i."currentPdfFileId"
        WHERE i."id" = ${invoice.id}
        LIMIT 1
    `;

    if (currentPdfFile?.hasStorageKey) {
        return (
            <div className="h-screen flex flex-col bg-gray-100">
                <div className="bg-white px-6 py-3 shadow shrink-0">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="font-bold text-lg">請求書: {invoice.invoiceNumber}</h1>
                            <p className="mt-1 text-sm text-slate-600">{invoice.customer.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                                保存済みPDFを表示しています。管理画面と共有画面は同じPDFファイルを参照します。
                            </p>
                        </div>
                        <InvoicePdfActions invoiceId={invoice.id} hasPdf={true} invoiceStatus={invoice.status} />
                    </div>
                    {invoice.status === "void" ? (
                        <div className="mt-3 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <p className="font-semibold">この請求書は取消済みです。</p>
                            <p className="mt-1">紐づいていた納品書は未請求状態に戻されています。</p>
                        </div>
                    ) : null}
                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                        <div className="flex gap-1">
                            <dt className="font-medium text-slate-800">version:</dt>
                            <dd>{currentPdfFile.version}</dd>
                        </div>
                        <div className="flex gap-1">
                            <dt className="font-medium text-slate-800">status:</dt>
                            <dd>{currentPdfFile.status}</dd>
                        </div>
                        <div className="flex gap-1">
                            <dt className="font-medium text-slate-800">generatedAt:</dt>
                            <dd>{formatPdfGeneratedAt(currentPdfFile.generatedAt)}</dd>
                        </div>
                        <div className="flex gap-1">
                            <dt className="font-medium text-slate-800">file:</dt>
                            <dd>{currentPdfFile.fileName}</dd>
                        </div>
                    </dl>
                </div>
                <iframe
                    src={`/api/invoices/${invoice.id}/pdf`}
                    className="flex-1 w-full border-0"
                    title="保存済み請求書PDF"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-6">
            <div className="rounded border border-amber-200 bg-amber-50 p-5 text-amber-950">
                <h1 className="text-lg font-bold">請求書: {invoice.invoiceNumber}</h1>
                <p className="mt-1 text-sm">{invoice.customer.name}</p>
                <p className="mt-3 text-sm">保存済みPDFはまだ生成されていません。</p>
                <p className="mt-1 text-xs text-amber-800">
                    管理画面と共有画面で同じPDFを表示するため、先に請求書PDFを生成してください。
                </p>
                <div className="mt-4">
                    <InvoicePdfActions invoiceId={invoice.id} hasPdf={false} invoiceStatus={invoice.status} />
                </div>
                {invoice.status === "void" ? (
                    <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        <p className="font-semibold">この請求書は取消済みです。</p>
                        <p className="mt-1">紐づいていた納品書は未請求状態に戻されています。</p>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
