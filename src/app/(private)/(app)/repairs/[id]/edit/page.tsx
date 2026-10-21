import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditRepairPage({ params }: { params: Promise<{ id: string }> }) {
    redirect(`/repairs/${(await params).id}`);
}
