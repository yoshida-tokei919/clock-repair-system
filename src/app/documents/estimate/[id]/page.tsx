import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

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

export default async function EstimateDocumentPage({ params }: { params: { id: string } }) {
    const id = parseInt(params.id);
    if (isNaN(id)) return notFound();

    const estimateDoc = await prisma.estimateDocument.findUnique({
        where: { id },
        include: {
            customer: true,
            repairs: {
                include: {
                    watch: { include: { brand: true, model: true, reference: true } },
                    estimate: { include: { items: { include: { partsMaster: { select: { grade: true, notes2: true } } } } } }
                }
            }
        }
    });

    if (!estimateDoc) return notFound();

    const [currentPdfFile] = await prisma.$queryRaw<{
        id: number;
        version: number;
        status: string;
        generatedAt: Date;
        fileName: string;
    }[]>`
        SELECT
            f."id",
            f."version",
            f."status",
            f."generatedAt",
            f."fileName"
        FROM "EstimateDocument" d
        JOIN "EstimatePdfFile" f ON f."id" = d."currentPdfFileId"
        WHERE d."id" = ${estimateDoc.id}
        LIMIT 1
    `;

    if (currentPdfFile) {
        return (
            <div className="h-screen flex flex-col bg-gray-100">
                <div className="bg-white px-6 py-3 shadow shrink-0">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="font-bold text-lg">見積書: {estimateDoc.estimateNumber}</h1>
                            <p className="mt-1 text-xs text-slate-500">
                                保存済みPDFを表示しています。管理画面と共有画面は同じPDFファイルを参照します。
                            </p>
                        </div>
                        <a
                            href={`/api/documents/estimate/${estimateDoc.id}/pdf`}
                            className="inline-flex h-9 items-center justify-center rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            PDFを開く
                        </a>
                    </div>
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
                    src={`/api/documents/estimate/${estimateDoc.id}/pdf`}
                    className="flex-1 w-full border-0"
                    title="保存済み見積PDF"
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-6">
            <div className="rounded border border-amber-200 bg-amber-50 p-5 text-amber-950">
                <h1 className="text-lg font-bold">見積書: {estimateDoc.estimateNumber}</h1>
                <p className="mt-3 text-sm">保存済みPDFはまだ生成されていません。</p>
                <p className="mt-1 text-xs text-amber-800">
                    管理画面と共有画面で同じPDFを表示するため、保存済みPDFを生成してから確認してください。
                </p>
            </div>
        </div>
    );
}
