"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { createCustomerRepairIntakeInvite, RepairIntakeError } from "@/lib/repair-intake";

export async function createCustomerRepairIntakeInviteAction(customerId: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { success: false as const, error: "Unauthorized" };
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { success: false as const, error: "Invalid customer." };
  }

  try {
    const { invite, reused } = await createCustomerRepairIntakeInvite(customerId);
    revalidatePath("/customers");
    revalidatePath("/line-users");
    return { success: true as const, token: invite.token, expiresAt: invite.expiresAt.toISOString(), reused };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof RepairIntakeError ? error.message : "Unable to create the repair intake link.",
    };
  }
}
