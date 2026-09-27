import type { PrismaClient } from "@prisma/client";
import { ProcurementSettingsError } from "@/lib/procurement-settings-domain";

export async function getProcurementSettings(db: PrismaClient) {
  const [suppliers, shippingMethods] = await Promise.all([
    db.supplier.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, leadTimeSetting: { select: { manualProcessingLeadDays: true } } } }),
    db.procurementShippingMethod.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }, { id: "asc" }] }),
  ]);
  return {
    suppliers: suppliers.map(row => ({ id: row.id, name: row.name,
      manualProcessingLeadDays: row.leadTimeSetting?.manualProcessingLeadDays ?? null })),
    shippingMethods,
  };
}

export async function saveSupplierLeadTime(db: PrismaClient, id: number, manualProcessingLeadDays: number | null) {
  const supplier = await db.supplier.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!supplier) throw new ProcurementSettingsError("仕入先が見つかりません。", 404);
  const setting = await db.supplierLeadTimeSetting.upsert({ where: { supplierId: id },
    create: { supplierId: id, manualProcessingLeadDays }, update: { manualProcessingLeadDays } });
  return { id: supplier.id, name: supplier.name, manualProcessingLeadDays: setting.manualProcessingLeadDays };
}

export function procurementSettingsResponseError(error: unknown) {
  if (error instanceof ProcurementSettingsError) return { message: error.message, status: error.status };
  if (error instanceof SyntaxError) return { message: "JSONの入力形式が正しくありません。", status: 400 };
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "P2002") return { message: "同じ名前の配送方法が既に登録されています。", status: 409 };
    if (error.code === "P2025" || error.code === "P2003") return { message: "対象が見つかりません。", status: 404 };
  }
  console.error("Procurement settings failed", error);
  return { message: "調達設定の処理に失敗しました。", status: 500 };
}
