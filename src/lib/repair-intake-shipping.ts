import "server-only";

export type RepairIntakeShippingAddress = {
  recipient: string;
  address: string;
};

export function getRepairIntakeShippingAddress(): RepairIntakeShippingAddress | null {
  const recipient = process.env.REPAIR_INTAKE_SHIP_TO_RECIPIENT?.trim();
  const address = process.env.REPAIR_INTAKE_SHIP_TO_ADDRESS?.trim();

  return recipient && address ? { recipient, address } : null;
}
