import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderToStream } from "@react-pdf/renderer";
import { TagDocument } from "@/components/pdf/TagDocument";
import QRCode from "qrcode";
import { print, getPrinters } from "pdf-to-printer";
import fs from "fs";
import path from "path";
import os from "os";

export async function POST(request: NextRequest) {
    try {
        const { repairId } = await request.json();

        if (!repairId) {
            return NextResponse.json({ error: "Missing repairId" }, { status: 400 });
        }

        // 1. Fetch Repair Data
        const repair = await prisma.repair.findUnique({
            where: { id: parseInt(repairId) },
            include: {
                customer: true,
                watch: { include: { brand: true, model: true } }
            }
        });

        if (!repair) {
            return NextResponse.json({ error: "Repair not found" }, { status: 404 });
        }

        // 2. Generate QR Code
        const qrCodeDataUrl = await QRCode.toDataURL(repair.inquiryNumber, { margin: 0 });

        // 3. Generate PDF
        const component = (
            <TagDocument
                repairId={repair.inquiryNumber}
                modelName={`${repair.watch.brand.name} ${repair.watch.model.name}`
                }
                customerName={repair.customer.name}
                qrCodeDataUrl={qrCodeDataUrl}
            />
        );

        const stream = await renderToStream(component);

        // 4. Save to Temp File
        const tempDir = os.tmpdir();
        const fileName = `tag-${repair.inquiryNumber}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, fileName);

        const fileStream = fs.createWriteStream(filePath);

        await new Promise((resolve, reject) => {
            // @ts-ignore
            stream.pipe(fileStream);
            stream.on('end', resolve);
            stream.on('error', reject);
        });

        // 5. Print
        // Using the ASCII-safe printer name found in debug output
        const printerName = "NEC MultiWriter 5750C";
        console.log(`Sending print job to: ${printerName}`);

        await print(filePath, { printer: printerName });

        return NextResponse.json({ success: true, message: "Print job sent" });

    } catch (error) {
        console.error("Printing Error:", error);
        return NextResponse.json({ error: "Failed to print" }, { status: 500 });
    }
}
