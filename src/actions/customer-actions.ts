"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * 顧客の新規作成
 */
export async function createCustomer(data: any) {
    try {
        // 業者の場合は屋号を、個人の場合はお名前を、システム上の表示名(name)として保存
        const displayName = data.type === 'business' ? data.companyName : data.name;

        const customer = await prisma.customer.create({
            data: {
                name: displayName,
                type: data.type,
                phone: data.phone,
                email: data.email,
                lineId: data.lineId,
                address: data.address,
                zipCode: data.zipCode,
                kana: data.kana,
                companyName: data.companyName,
                isPartner: data.isPartner || false,
                prefix: data.prefix?.toUpperCase() || null,
                rank: parseInt(data.rank || "1"),
            }
        });
        revalidatePath("/customers");
        return { success: true, customer };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * 顧客一覧の取得
 */
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

/**
 * 顧客詳細の取得
 */
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

/**
 * 顧客情報の更新
 */
export async function updateCustomer(id: number, data: any) {
    try {
        const displayName = data.type === 'business' ? data.companyName : data.name;

        const updated = await prisma.customer.update({
            where: { id },
            data: {
                name: displayName,
                type: data.type,
                phone: data.phone,
                email: data.email,
                lineId: data.lineId,
                address: data.address,
                isPartner: data.isPartner,
                prefix: data.prefix?.toUpperCase() || null,
                companyName: data.companyName,
                kana: data.kana,
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

/**
 * 顧客の削除
 */
export async function deleteCustomer(id: number) {
    try {
        const repairCount = await prisma.repair.count({ where: { customerId: id } });
        if (repairCount > 0) {
            throw new Error("修理履歴がある顧客は削除できません。");
        }

        await prisma.customer.delete({ where: { id } });
        revalidatePath("/customers");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
