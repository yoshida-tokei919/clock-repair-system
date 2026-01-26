const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
    console.log('Cleaning up orphaned foreign keys in Repair table...');

    // 1. Get all repairs with document IDs
    const repairs = await prisma.repair.findMany({
        where: {
            OR: [
                { deliveryNoteId: { not: null } },
                { invoiceId: { not: null } },
                { estimateDocumentId: { not: null } }
            ]
        }
    });

    for (const r of repairs) {
        let updateData = {};

        if (r.deliveryNoteId) {
            const exists = await prisma.deliveryNote.findUnique({ where: { id: r.deliveryNoteId } });
            if (!exists) {
                console.log(`Repair ${r.id}: DeliveryNote ${r.deliveryNoteId} not found. Setting to null.`);
                updateData.deliveryNoteId = null;
            }
        }

        if (r.invoiceId) {
            const exists = await prisma.invoice.findUnique({ where: { id: r.invoiceId } });
            if (!exists) {
                console.log(`Repair ${r.id}: Invoice ${r.invoiceId} not found. Setting to null.`);
                updateData.invoiceId = null;
            }
        }

        if (r.estimateDocumentId) {
            const exists = await prisma.estimateDocument.findUnique({ where: { id: r.estimateDocumentId } });
            if (!exists) {
                console.log(`Repair ${r.id}: EstimateDocument ${r.estimateDocumentId} not found. Setting to null.`);
                updateData.estimateDocumentId = null;
            }
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.repair.update({
                where: { id: r.id },
                data: updateData
            });
        }
    }

    console.log('Cleanup completed.');
    await prisma.$disconnect();
}

cleanup();
