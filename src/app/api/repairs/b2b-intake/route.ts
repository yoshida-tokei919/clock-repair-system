import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { createB2bBatchIntake, B2bBatchIntakeError, parseB2bBatchPayload } from "@/lib/b2b-batch-intake";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email }, select: { id: true } });
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const input = parseB2bBatchPayload(await request.json());
    const result = await createB2bBatchIntake(prisma, input, admin.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "入力内容が不正です。" }, { status: 400 });
    }
    if (error instanceof B2bBatchIntakeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error && typeof error === "object" && "code" in error &&
      (error.code === "P2002" || error.code === "P2034")) {
      return NextResponse.json({ error: "受付番号が競合しました。取引先と登録結果を確認してください。" }, { status: 409 });
    }
    console.error("B2B batch intake failed", error);
    return NextResponse.json({ error: "一括受付に失敗しました。登録結果を確認してください。" }, { status: 500 });
  }
}
