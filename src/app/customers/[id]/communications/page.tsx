import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { CustomerLineReply } from "@/components/customers/CustomerLineReply";
import { getCustomerCommunicationHub } from "@/lib/customer-communication-hub";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

export default async function CustomerCommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const customerId = Number((await params).id);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) notFound();
  const hub = await getCustomerCommunicationHub(prisma, customerId);
  if (!hub) notFound();

  const displayName = hub.customer.type === "business"
    ? hub.customer.companyName || hub.customer.name
    : hub.customer.name;
  const userNames = new Map(hub.lineUsers.map((user) => [user.id, user.displayName || "表示名未取得"]));

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <Link className="text-sm text-blue-700 hover:underline" href="/customers">← 顧客一覧</Link>
        <h1 className="mt-3 text-2xl font-bold text-zinc-900">{displayName} のやり取り</h1>
        <p className="mt-1 text-sm text-zinc-600">確認済みLINE履歴・{hub.messages.length}件</p>
      </div>

      <CustomerLineReply customerId={customerId} destinations={hub.destinations} />

      {hub.pendingOutboxes.length > 0 && <section className="space-y-3">
        <h2 className="font-semibold">LINE送信待ち・結果確認中</h2>
        <ol className="space-y-2">
          {hub.pendingOutboxes.map((outbox) => <li key={outbox.id} className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
            <div className="text-xs text-amber-900">
              {outbox.status === "POST_UNCONFIRMED" ? "送信結果確認中" : outbox.status === "PRE_SEND_FAILED" ? "送信前に失敗・再試行待ち" : outbox.status === "CLAIMED" ? "送信処理中" : "送信待ち"}
              ・{formatDate(outbox.approvedAt)}・{userNames.get(outbox.lineUserId)}
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words">{outbox.text}</p>
          </li>)}
        </ol>
      </section>}

      {hub.hasEarlierMessages && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          保存済みLINE履歴は500件を超えています。ここには新しい500件のみ表示しています。以前のメッセージは表示されていません。
        </p>
      )}

      {hub.lineUsers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-zinc-600">
          紐付け済みのLINEユーザーがありません。LINE履歴は表示できません。
        </div>
      ) : hub.messages.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-zinc-600">
          紐付け済みのLINEユーザーに保存済みのメッセージはありません。
        </div>
      ) : (
        <ol className="space-y-3">
          {hub.messages.map((message) => (
            <li key={message.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                <span className="font-semibold text-zinc-900">
                  {message.direction === "INBOUND" ? "受信" : "送信済み"}
                </span>
                <time dateTime={message.occurredAt.toISOString()}>{formatDate(message.occurredAt)}</time>
                <span>{message.channel} · {userNames.get(message.lineUserId)}</span>
                <span>{message.messageType}</span>
              </div>
              {message.body && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-900">{message.body}</p>}
              {message.files.filter((file) => file.uploadStatus === "STORED").map((file) => {
                const href = `/api/inquiries/${message.inquiryId}/line/files/${file.id}`;
                return (
                  <div key={file.id} className="mt-3">
                    {file.mimeType?.startsWith("image/") ? (
                      <a href={href} target="_blank" rel="noreferrer" aria-label="LINE画像を開く">
                        {/* The authenticated same-origin route checks storage and signs a short-lived read URL. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={href} alt="LINE添付画像" className="max-h-80 max-w-full rounded border object-contain" />
                      </a>
                    ) : (
                      <a className="text-sm text-blue-700 underline" href={href} target="_blank" rel="noreferrer">添付ファイルを開く</a>
                    )}
                  </div>
                );
              })}
              {message.messageType !== "TEXT" && !message.body && !message.files.some((file) => file.uploadStatus === "STORED") && (
                <p className="mt-3 text-sm text-zinc-500">本文・保存済み添付ファイルはありません。</p>
              )}
              <div className="mt-3 border-t pt-2 text-xs text-zinc-600">
                <Link className="text-blue-700 hover:underline" href={`/inquiries/${message.inquiryId}/review`}>
                  Inquiry #{message.inquiryId}（{message.inquiryStatus}）を開く
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-zinc-500">送信待ち・送信結果未確認の内容は確認済み履歴には含みません。</p>
    </main>
  );
}
