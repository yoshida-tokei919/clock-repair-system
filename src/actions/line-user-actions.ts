"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getLineUsers() {
  return prisma.lineUser.findMany({
    include: { linkedCustomer: { select: { id: true, name: true, companyName: true, type: true } } },
    orderBy: [{ linkedCustomerId: "asc" }, { lastReceivedAt: "desc" }],
  });
}

export async function searchCustomersForLineUser(query: string) {
  const term = query.trim();
  if (!term) return [];
  return prisma.customer.findMany({
    where: { OR: [
      { name: { contains: term, mode: "insensitive" } },
      { companyName: { contains: term, mode: "insensitive" } },
      { prefix: { contains: term, mode: "insensitive" } },
      { phone: { contains: term, mode: "insensitive" } },
    ] },
    select: { id: true, name: true, companyName: true, type: true, prefix: true, phone: true, lineId: true },
    orderBy: { createdAt: "desc" }, take: 20,
  });
}

export async function linkLineUserToCustomer(lineUserId: string, customerId: number) {
  try {
    await prisma.$transaction(async (tx) => {
      const lineUser = await tx.lineUser.findUnique({ where: { lineUserId }, select: { linkedCustomerId: true } });
      if (!lineUser) throw new Error("対象のLINEユーザーが見つかりません。");
      if (lineUser.linkedCustomerId !== null) throw new Error("このLINEユーザーはすでに別の顧客へ紐付いています。");

      const [customer, sameLineCustomers] = await Promise.all([
        tx.customer.findUnique({ where: { id: customerId }, select: { lineId: true } }),
        tx.customer.findMany({ where: { lineId: lineUserId }, select: { id: true } }),
      ]);
      if (!customer) throw new Error("対象の顧客が見つかりません。");
      if (sameLineCustomers.length > 1) throw new Error("同じLINE userIdを持つ顧客が複数あるため、紐付けを中止しました。");
      if (customer.lineId && customer.lineId !== lineUserId) {
        throw new Error("この顧客には別のLINE userIdが登録されているため、紐付けできません。");
      }
      if (sameLineCustomers.length === 1 && sameLineCustomers[0].id !== customerId) {
        throw new Error("このLINE userIdは別の顧客に登録されているため、紐付けできません。");
      }

      await tx.customer.update({ where: { id: customerId }, data: { lineId: lineUserId } });
      const linked = await tx.lineUser.updateMany({
        where: { lineUserId, linkedCustomerId: null },
        data: { linkedCustomerId: customerId, linkedAt: new Date() },
      });
      if (linked.count !== 1) throw new Error("LINEユーザーの紐付け状態が変わったため、紐付けを中止しました。");
    });
    revalidatePath("/line-users");
    revalidatePath("/customers");
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "紐付けに失敗しました。" };
  }
}
