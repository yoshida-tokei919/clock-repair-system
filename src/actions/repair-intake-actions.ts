"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { createCustomerRepairIntakeInvite, createInquiryRepairIntakeInvite, createLineUserRepairIntakeInvite, RepairIntakeError } from "@/lib/repair-intake";

export async function createCustomerRepairIntakeInviteAction(customerId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { success: false as const, error: "認証情報を確認できません。再ログインしてください。" };
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { success: false as const, error: "顧客情報が正しくありません。" };
  }

  try {
    const { invite, reused } = await createCustomerRepairIntakeInvite(customerId);
    revalidatePath("/customers");
    revalidatePath("/line-users");
    return { success: true as const, token: invite.token, expiresAt: invite.expiresAt.toISOString(), reused };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof RepairIntakeError ? error.message : "送付受付リンクを発行できませんでした。",
    };
  }
}

export async function createInquiryRepairIntakeInviteAction(inquiryId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { success: false as const, error: "ログインしてください。" };
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) return { success: false as const, error: "お問い合わせ番号が不正です。" };
  try {
    const { invite, reused } = await createInquiryRepairIntakeInvite(inquiryId);
    revalidatePath(`/inquiries/${inquiryId}/review`);
    return { success: true as const, token: invite.token, expiresAt: invite.expiresAt.toISOString(), reused };
  } catch (error) {
    return { success: false as const, error: error instanceof RepairIntakeError ? error.message : "受付リンクを発行できませんでした。" };
  }
}

export async function createLineUserRepairIntakeInviteAction(lineUserId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { success: false as const, error: "認証情報を確認できません。再ログインしてください。" };
  if (!Number.isInteger(lineUserId) || lineUserId <= 0) {
    return { success: false as const, error: "LINEユーザー情報が正しくありません。" };
  }

  try {
    const { invite, reused } = await createLineUserRepairIntakeInvite(lineUserId);
    revalidatePath("/line-users");
    return { success: true as const, token: invite.token, expiresAt: invite.expiresAt.toISOString(), reused };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof RepairIntakeError ? error.message : "送付受付リンクを発行できませんでした。",
    };
  }
}
