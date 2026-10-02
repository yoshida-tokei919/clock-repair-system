import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { shipmentFailure, shipmentId } from "@/lib/shipment";
import { parseReleaseRequest, previewShipmentTagRelease, releaseShipmentTags,
  shipmentTagReleaseFailure } from "@/lib/shipment-tag-release";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function adminId(): Promise<number | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  return admin?.id ?? null;
}

function failure(error: unknown) {
  const result = shipmentFailure(error);
  const releaseResult = result.status === 500 ? shipmentTagReleaseFailure(error) : result;
  if (releaseResult.status === 500) console.error("Shipment PhysicalTag release failed");
  return NextResponse.json({ error: releaseResult.message }, { status: releaseResult.status });
}

export async function GET(_request: Request, { params }: Context) {
  if (!(await adminId())) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  try {
    return NextResponse.json(await previewShipmentTagRelease(prisma, shipmentId((await params).id)));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Context) {
  const operatorId = await adminId();
  if (!operatorId) return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  let id: number;
  let input: ReturnType<typeof parseReleaseRequest>;
  try {
    id = shipmentId((await params).id);
    input = parseReleaseRequest(await request.json());
  } catch (error) {
    const result = shipmentTagReleaseFailure(error);
    return NextResponse.json({ error: result.status === 500 ? "入力が不正です。" : result.message }, { status: 400 });
  }
  try {
    return NextResponse.json(await releaseShipmentTags(prisma, id, input, operatorId));
  } catch (error) { return failure(error); }
}
