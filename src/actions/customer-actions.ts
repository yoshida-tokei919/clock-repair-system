"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getCustomers(query?: string) {
    return await prisma.customer.findMany({
        where: query ? {
            OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
                { lineId: { contains: query, mode: 'insensitive' } },
            ]
        } : {},
        orderBy: { createdAt: 'desc' }
    });
}

export async function getCustomerById(id: number) {
    return await prisma.customer.findUnique({
        where: { id },
        include: {
            repairs: {
                orderBy: { createdAt: 'desc' },
                take: 10
            }
        }
    });
}

export async function updateCustomer(id: number, data: any) {
    try {
        const updated = await prisma.customer.update({
            where: { id },
            data: {
                name: data.name,
                type: data.type,
                phone: data.phone,
                email: data.email,
                lineId: data.lineId,
                address: data.address,
                isPartner: data.isPartner,
                prefix: data.prefix,
                rank: parseInt(data.rank || "1"),
            }
        });
        revalidatePath("/customers");
        revalidatePath(`/customers/${id}`);
        return { success: true, customer: updated };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteCustomer(id: number) {
    try {
        // Check if customer has repairs
        const repairCount = await prisma.repair.count({ where: { customerId: id } });
        if (repairCount > 0) {
            throw new Error("修理履歴がある顧客は削除できません。先に修理データを配慮するか、無効化してください。");
        }

        await prisma.customer.delete({ where: { id } });
        revalidatePath("/customers");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
