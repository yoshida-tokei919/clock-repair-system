import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

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

        // Create Directory Structure: public/uploads/YYYY/MM
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const uploadDir = path.join(process.cwd(), "public", "uploads", String(year), month);

        await mkdir(uploadDir, { recursive: true });

        // Generate Unique Filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.name) || ".jpg";
        const prefix = repairId ? `rep-${repairId}` : (partId ? `part-${partId}` : "gen");
        const filename = `${prefix}-${uniqueSuffix}${ext}`;
        const filepath = path.join(uploadDir, filename);

        // Write File
        await writeFile(filepath, buffer);

        // Public URL (relative to root)
        const storageKey = `/uploads/${year}/${month}/${filename}`;

        let photo = null;

        // Save to DB only if repairId is present (for repair photos specifically)
        if (repairId && repairId !== "null" && repairId !== "undefined") {
            try {
                photo = await prisma.repairPhoto.create({
                    data: {
                        repairId: parseInt(repairId),
                        category: category,
                        storageKey: storageKey,
                        fileName: file.name,
                        mimeType: file.type,
                    },
                });
            } catch (e) {
                console.error("DB Save failed for repairPhoto, but file was written", e);
            }
        }

        // Return storageKey for any caller to use
        return NextResponse.json({ success: true, photo, storageKey, fileName: file.name, mimeType: file.type });
    } catch (error) {
        console.error("Upload Error:", error);
        return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
    }
}
