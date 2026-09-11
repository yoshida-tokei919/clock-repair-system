import { RepairIntakeForm } from "./RepairIntakeForm";

export const dynamic = "force-dynamic";

export default function CustomerRepairIntakePage({ params }: { params: { token: string } }) {
  return <RepairIntakeForm token={params.token} />;
}
