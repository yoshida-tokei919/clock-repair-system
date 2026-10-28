"use server";

import { prisma } from "@/lib/prisma";
import { deleteCustomerSafely } from "@/lib/customer-deletion-safety";
import { revalidatePath } from "next/cache";
import { validateCustomerDefaultShipping } from "@/lib/customer-default-shipping";
import { assertCustomerCanBecomeIndividual } from "@/lib/invoice-recipient";

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
        const finalPrefix = type === 'business'
            ? data.prefix?.trim().toUpperCase()
            : 'C';
        if (type === 'business' && !finalPrefix) {
            return { success: false, error: "業者登録ではプレフィックスを入力してください。" };
        }
        if (type === 'business') {
            const existingPrefixCustomer = await prisma.customer.findFirst({
                where: { type: 'business', prefix: finalPrefix }
            });
            if (existingPrefixCustomer) {
                return { success: false, error: "このプレフィックスは既に使用されています。別のプレフィックスを指定してください。" };
            }
        }

        const createData = {
            name: displayName, type, phone: data.phone, email: data.email, lineId: data.lineUserId || data.lineId,
            address: data.address, zipCode: data.zipCode, kana: data.kana, companyName: data.companyName,
            isPartner: type === 'business', prefix: finalPrefix,
            currentSeq: type === 'individual' ? 9999 : 0, rank: parseInt(data.rank || "1"),
        };
        const customer = data.lineUserId
            ? await prisma.$transaction(async (tx) => {
                const lineUser = await tx.lineUser.findUnique({ where: { lineUserId: data.lineUserId }, select: { linkedCustomerId: true } });
                if (!lineUser) throw new Error("対象のLINEユーザーが見つかりません。");
                if (lineUser.linkedCustomerId !== null) throw new Error("このLINEユーザーはすでに別の顧客へ紐付いています。");
                if (await tx.customer.count({ where: { lineId: data.lineUserId } }) > 0) {
                    throw new Error("このLINE userIdを持つ既存顧客があるため、新規登録を中止しました。");
                }
                const created = await tx.customer.create({ data: createData });
                const linked = await tx.lineUser.updateMany({
                    where: { lineUserId: data.lineUserId, linkedCustomerId: null },
                    data: { linkedCustomerId: created.id, linkedAt: new Date() },
                });
                if (linked.count !== 1) throw new Error("LINEユーザーの紐付け状態が変わったため、新規登録を中止しました。");
                return created;
            })
            : await prisma.customer.create({ data: createData });
        revalidatePath("/customers");
        revalidatePath("/line-users");
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
        if (type === 'business' && data.pricingTaxMode !== 'EXCLUSIVE' && data.pricingTaxMode !== 'INCLUSIVE') {
            throw new Error('価格の税表示方式を選択してください');
        }
        const defaultShipping = validateCustomerDefaultShipping(type, {
            defaultShippingCarrierCode: data.defaultShippingCarrierCode ?? null,
            defaultShippingServiceCode: data.defaultShippingServiceCode ?? null,
            defaultShippingSize: data.defaultShippingSize == null || data.defaultShippingSize === '' ? null : Number(data.defaultShippingSize),
            defaultShippingFee: data.defaultShippingFee == null || data.defaultShippingFee === '' ? null : Number(data.defaultShippingFee),
        });
        const displayName = type === 'business' ? data.companyName : data.name;
        const finalPrefix = type === 'business'
            ? data.prefix?.trim().toUpperCase()
            : 'C';
        if (type === 'business' && !finalPrefix) {
            return { success: false, error: "業者登録ではプレフィックスを入力してください。" };
        }
        if (type === 'business') {
            const existingPrefixCustomer = await prisma.customer.findFirst({
                where: {
                    type: 'business',
                    prefix: finalPrefix,
                    NOT: { id }
                }
            });
            if (existingPrefixCustomer) {
                return { success: false, error: "このプレフィックスは既に使用されています。別のプレフィックスを指定してください。" };
            }
        }

        const updated = await prisma.$transaction(async tx => {
          if (type === 'individual') await assertCustomerCanBecomeIndividual(tx, id);
          return tx.customer.update({
            where: { id },
            data: {
                name: displayName,
                type: type,
                phone: data.phone,
                email: data.email,
                lineId: data.lineId,
                address: data.address,
                isPartner: type === 'business',
                prefix: finalPrefix,
                companyName: data.companyName,
                kana: data.kana,
                rank: parseInt(data.rank || "1"),
                ...defaultShipping,
                pricingTaxMode: type === 'business' ? data.pricingTaxMode : 'EXCLUSIVE',
                invoiceRecipientCustomerId: type === 'individual' ? null : undefined,
            }
          });
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

/** Repair entry autocomplete only. Keep the general customer listing unchanged. */
export async function searchRepairCustomers(type: "business" | "individual", query: string) {
    if (type !== "business" && type !== "individual") {
        throw new Error("顧客種別を選択してください。");
    }

    const search = query.trim();
    return prisma.customer.findMany({
        where: {
            type: {
                in: type === "business" ? ["business", "b2b"] : ["individual", "b2c"],
                mode: "insensitive",
            },
            ...(search ? {
                OR: [
                    { name: { contains: search, mode: "insensitive" as const } },
                    { phone: { contains: search, mode: "insensitive" as const } },
                    { prefix: { contains: search, mode: "insensitive" as const } },
                ],
            } : {}),
        },
        select: {
            id: true,
            name: true,
            type: true,
            phone: true,
            prefix: true,
            lineId: true,
            address: true,
            pricingTaxMode: true,
        },
        orderBy: { createdAt: "desc" },
        take: 30,
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
        await deleteCustomerSafely(prisma, id);
        revalidatePath("/customers");
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
