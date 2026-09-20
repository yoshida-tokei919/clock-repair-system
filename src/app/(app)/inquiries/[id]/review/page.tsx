import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { InquiryReviewScreen } from "@/components/inquiries/InquiryReviewScreen";
import { authOptions } from "@/lib/auth";

export default async function InquiryReviewPage({ params }: { params: { id: string } }) {
  const inquiryId = Number(params.id);
  if (!Number.isInteger(inquiryId) || inquiryId <= 0) notFound();

  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return <InquiryReviewScreen inquiryId={inquiryId} />;
}
