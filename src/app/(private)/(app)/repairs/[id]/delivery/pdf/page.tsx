import { notFound } from "next/navigation";
import React from 'react';
import { DeliveryPDFClient } from "@/components/pdf/DeliveryPDFClient";
import { getRepairDataForPDF } from '@/lib/repairs';

export default async function DeliveryPDFPage({ params }: { params: Promise<{ id: string }> }) {
    const pdfData = await getRepairDataForPDF(parseInt((await params).id));

    if (!pdfData) notFound();

    return <DeliveryPDFClient data={pdfData as any} />;
}
