import { requireAdminApi } from "@/lib/admin-api-auth";
import { HistoricalRefundError, registerHistoricalRefund, validateHistoricalRefund } from "@/lib/b2b-historical-refund";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "Invalid delivery note id" }, { status: 400 });
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) return Response.json({ error: "JSON body required" }, { status: 400 });
  try {
    const refund = await registerHistoricalRefund(id, validateHistoricalRefund(await request.json()));
    return Response.json({ id: refund.id, status: refund.status }, { status: 201 });
  } catch (error) {
    if (error instanceof HistoricalRefundError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON" }, { status: 400 });
    console.error("Historical refund registration failed", error);
    return Response.json({ error: "登録に失敗しました" }, { status: 500 });
  }
}
