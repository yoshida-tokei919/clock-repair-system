"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * 送信された文字列が「ひらがな・全角カタカナ・半角英数字・漢字」のみかチェック
 */
function isValidChar(str: string) {
    // 漢字を含む全ての一般的な日本語文字・英数字を許可
    const regex = /^[ぁ-んァ-ヶa-zA-Z0-9ー\u4E00-\u9FFF\s\d]+$/;
    return regex.test(str);
}

/**
 * 重複チェック用: 一致する顧客を探す
 */
export async function checkDuplicateCustomer(name: string, prefix: string) {
    const matches = await prisma.customer.findMany({
        where: {
            OR: [
                { name: { equals: name } },
                { prefix: { equals: prefix?.toUpperCase() } }
            ]
        },
        select: {
            id: true,
            name: true,
            prefix: true,
            type: true,
            phone: true
        }
    });
    return matches;
}

/**
 * 顧客の新規作成
 */
export async function createCustomer(data: any) {
    try {
        const type = data.type || 'individual';
        const displayName = type === 'business' ? data.companyName : data.name;

        // プレフィックスの決定: 個人は強制的に 'C'
        const finalPrefix = type === 'business' ? data.prefix?.toUpperCase() : 'C';

        const customer = await prisma.customer.create({
            data: {
                name: displayName,
                type: type,
                phone: data.phone,
                email: data.email,
                lineId: data.lineId,
                address: data.address,
                zipCode: data.zipCode,
                kana: data.kana,
                companyName: data.companyName,
                isPartner: true, // 全員プレフィックス持ちなので Partner 扱い
                prefix: finalPrefix,
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
 * 顧客情報の更新
 */
export async function updateCustomer(id: number, data: any) {
    try {
        const type = data.type || 'individual';
        const displayName = type === 'business' ? data.companyName : data.name;
        const finalPrefix = type === 'business' ? data.prefix?.toUpperCase() : 'C';

        const updated = await prisma.customer.update({
            where: { id },
            data: {
                name: displayName,
                type: type,
                phone: data.phone,
                email: data.email,
                lineId: data.lineId,
                address: data.address,
                isPartner: true,
                prefix: finalPrefix,
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
 * 顧客一覧・詳細・削除 (既存のまま)
 */
export async function getCustomers(query?: string) {
    return await prisma.customer.findMany({
        where: query ? {
            OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
                { prefix: { contains: query, mode: 'insensitive' } },
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

export async function deleteCustomer(id: number) {
    try {
        const repairCount = await prisma.repair.count({ where: { customerId: id } });
        if (repairCount > 0) throw new Error("修理履歴がある顧客は削除できません。");
        await prisma.customer.delete({ where: { id } });
        revalidatePath("/customers");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
