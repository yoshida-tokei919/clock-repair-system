import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { InquiryStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<InquiryStatus, string> = {
  OPEN: "\u53d7\u4fe1\u6e08\u307f",
  AI_PENDING: "AI\u89e3\u6790\u5f85\u3061",
  AI_PROCESSED: "AI\u89e3\u6790\u6e08\u307f",
  NEEDS_REVIEW: "\u78ba\u8a8d\u5f85\u3061",
  WAITING_CUSTOMER: "\u304a\u5ba2\u69d8\u8fd4\u4fe1\u5f85\u3061",
  READY_FOR_INTAKE: "\u53d7\u4ed8\u6e96\u5099\u5b8c\u4e86",
  CLOSED: "\u5b8c\u4e86",
};

function receivedAtLabel(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(value);
}

function watchSummary(watch: {
  position: number;
  label: string | null;
  summary: string | null;
  fieldValues: Array<{ value: string }>;
}) {
  const title = watch.label || `#${watch.position}`;
  const detail = watch.summary || watch.fieldValues.map((field) => field.value).filter(Boolean).join(" / ");
  return detail ? `${title}: ${detail}` : title;
}

export default async function InquiriesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const inquiries = await prisma.inquiry.findMany({
    where: { status: { not: "CLOSED" } },
    orderBy: { lastReceivedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      lastReceivedAt: true,
      lineUser: {
        select: {
          displayName: true,
          linkedCustomer: { select: { name: true } },
        },
      },
      reviewWatches: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          label: true,
          summary: true,
          fieldValues: {
            orderBy: { field: "asc" },
            select: { value: true },
          },
        },
      },
    },
  });

  return (
    <div className="space-y-4 p-8 pt-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{"\u304a\u554f\u3044\u5408\u308f\u305b\u4e00\u89a7"}</h1>
        <p className="mt-1 text-sm text-zinc-600">{"\u5b8c\u4e86\u4ee5\u5916\u306e\u304a\u554f\u3044\u5408\u308f\u305b\u3092\u65b0\u7740\u9806\u306b\u8868\u793a\u3057\u3066\u3044\u307e\u3059\u3002"}</p>
      </div>

      {inquiries.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-zinc-500">{"\u5bfe\u5fdc\u4e2d\u306e\u304a\u554f\u3044\u5408\u308f\u305b\u306f\u3042\u308a\u307e\u305b\u3093\u3002"}</div>
      ) : (
        <div className="overflow-hidden rounded-md border bg-white">
          {inquiries.map((inquiry) => {
            const customerName = inquiry.lineUser.linkedCustomer?.name || inquiry.lineUser.displayName || "\u540d\u524d\u672a\u767b\u9332";
            return (
              <Link
                key={inquiry.id}
                href={`/inquiries/${inquiry.id}/review`}
                className="block border-b p-4 last:border-b-0 hover:bg-zinc-50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{customerName}</span>
                    <Badge variant="secondary">{STATUS_LABELS[inquiry.status]}</Badge>
                  </div>
                  <time className="text-sm text-zinc-500" dateTime={inquiry.lastReceivedAt.toISOString()}>
                    {receivedAtLabel(inquiry.lastReceivedAt)}
                  </time>
                </div>
                <div className="mt-2 text-sm text-zinc-600">
                  {inquiry.reviewWatches.length > 0
                    ? inquiry.reviewWatches.map(watchSummary).join(" | ")
                    : "\u6642\u8a08\u60c5\u5831\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002"}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
