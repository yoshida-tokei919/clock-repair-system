import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


export async function POST(request: NextRequest) {
    try {
        const data = await request.formData();
        const file: File | null = data.get("file") as unknown as File;
        const repairId = data.get("repairId") as string;
        const partId = data.get("partId") as string;
        const category = data.get("category") as string || "general";

        if (!file) {
            return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Convert to Base64 Data URL
        const base64Docs = `data:${file.type};base64,${buffer.toString('base64')}`;

        // In this "Base64 Mode", we store the actual image data in storageKey.
        // This is a temporary solution to bypass file system issues on serverless.
        const storageKey = base64Docs;

        let photo = null;

        // Save to DB only if repairId is present (for repair photos specifically)
        if (repairId && repairId !== "null" && repairId !== "undefined") {
            try {
                photo = await prisma.repairPhoto.create({
                    data: {
                        repairId: parseInt(repairId),
                        category: category,
                        storageKey: storageKey, // Saving Base64 directly
                        fileName: file.name,
                        mimeType: file.type,
                    },
                });
            } catch (e) {
                console.error("DB Save failed for repairPhoto", e);
                return NextResponse.json({ success: false, error: "Database save failed" }, { status: 500 });
            }
        }

        // Return storageKey (Base64) for caller to display immediately
        return NextResponse.json({ success: true, photo, storageKey, fileName: file.name, mimeType: file.type });
    } catch (error) {
        console.error("Upload Error:", error);
        return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
    }
}
