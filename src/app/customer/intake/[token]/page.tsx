import { RepairIntakeForm } from "./RepairIntakeForm";

export const dynamic = "force-dynamic";

export default async function CustomerRepairIntakePage({ params }: { params: Promise<{ token: string }> }) {
  return <RepairIntakeForm token={(await params).token} />;
}
