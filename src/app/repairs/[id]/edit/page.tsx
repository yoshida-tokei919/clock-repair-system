import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EditRepairPage({ params }: { params: { id: string } }) {
    redirect(`/repairs/${params.id}`);
}
