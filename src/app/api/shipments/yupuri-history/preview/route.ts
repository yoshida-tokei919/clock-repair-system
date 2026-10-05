import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseYupuriHistory, resolveYupuriHistory, YupuriHistoryError, YUPURI_HISTORY_MAX_BYTES,
} from "@/lib/yupuri-history";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!admin) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Invalid multipart request" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || form.getAll("file").length !== 1 || [...form.keys()].some(key => key !== "file"))
      return NextResponse.json({ error: "Exactly one CSV file is required" }, { status: 400 });
    if (file.size > YUPURI_HISTORY_MAX_BYTES)
      return NextResponse.json({ error: "CSV file size limit exceeded" }, { status: 413 });
    const rows = parseYupuriHistory(Buffer.from(await file.arrayBuffer()));
    const ids = [...new Set(rows.flatMap(row => row.resolvedShipmentId === null ? [] : [row.resolvedShipmentId]))];
    const shipments = ids.length ? await prisma.shipment.findMany({
      where: { id: { in: ids } },
      select: { id: true, direction: true, status: true, trackingNumber: true,
        actualShippedAt: true, deliveredAt: true },
    }) : [];
    return NextResponse.json({ rows: resolveYupuriHistory(rows, shipments) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof YupuriHistoryError)
      return NextResponse.json({ error: error.message }, { status: 422 });
    console.error("Yu-Pri R history preview failed", error);
    return NextResponse.json({ error: "History preview failed" }, { status: 500 });
  }
}
