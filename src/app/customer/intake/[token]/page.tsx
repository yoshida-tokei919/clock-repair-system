import { RepairIntakeForm } from "./RepairIntakeForm";
import { getRepairIntakeShippingAddress } from "@/lib/repair-intake-shipping";

export const dynamic = "force-dynamic";

export default function CustomerRepairIntakePage({ params }: { params: { token: string } }) {
  return <RepairIntakeForm token={params.token} shippingAddress={getRepairIntakeShippingAddress()} />;
}
