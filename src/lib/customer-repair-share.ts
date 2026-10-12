type CustomerRepairShareDb = {
  repair: {
    findUnique: (args: {
      where: { publicToken: string };
      select: {
        id: true;
        customerId: true;
        repairIntakeInviteId: true;
        customer: { select: { type: true } };
      };
    }) => Promise<{
      id: number;
      customerId: number;
      repairIntakeInviteId: number | null;
      customer: { type: string };
    } | null>;
    findMany: (args: {
      where: { repairIntakeInviteId: number; customerId: number };
      orderBy: { id: "asc" };
      select: { id: true; publicToken: true };
    }) => Promise<Array<{ id: number; publicToken: string | null }>>;
  };
};

export type CustomerRepairShareScope =
  | {
      anchorRepairId: number;
      repairIds: number[];
      grouped: false;
    }
  | {
      anchorRepairId: number;
      repairIds: number[];
      grouped: true;
      customerId: number;
      repairIntakeInviteId: number;
    };

function singleRepairScope(repairId: number): CustomerRepairShareScope {
  return { anchorRepairId: repairId, repairIds: [repairId], grouped: false };
}

/**
 * Resolves only an exact Repair.publicToken. B2C repairs from the same completed
 * intake may share one read page, but unrelated intakes and other customers are
 * never folded into that scope.
 *
 * Legacy intake siblings without their own publicToken fail closed to the anchor
 * repair so a sibling action can never accidentally reuse the anchor token.
 */
export async function resolveCustomerRepairShareScope(
  db: CustomerRepairShareDb,
  rawToken: string,
): Promise<CustomerRepairShareScope | null> {
  const token = rawToken.trim();
  if (!token) return null;

  const anchor = await db.repair.findUnique({
    where: { publicToken: token },
    select: {
      id: true,
      customerId: true,
      repairIntakeInviteId: true,
      customer: { select: { type: true } },
    },
  });
  if (!anchor) return null;

  if (anchor.customer.type !== "individual" || anchor.repairIntakeInviteId === null) {
    return singleRepairScope(anchor.id);
  }

  const siblings = await db.repair.findMany({
    where: {
      repairIntakeInviteId: anchor.repairIntakeInviteId,
      customerId: anchor.customerId,
    },
    orderBy: { id: "asc" },
    select: { id: true, publicToken: true },
  });

  if (!siblings.some((repair) => repair.id === anchor.id)) {
    return singleRepairScope(anchor.id);
  }
  if (siblings.some((repair) => !repair.publicToken?.trim())) {
    return singleRepairScope(anchor.id);
  }

  const repairIds = siblings.map((repair) => repair.id);
  if (repairIds.length <= 1) return singleRepairScope(anchor.id);

  return {
    anchorRepairId: anchor.id,
    repairIds,
    grouped: true,
    customerId: anchor.customerId,
    repairIntakeInviteId: anchor.repairIntakeInviteId,
  };
}
