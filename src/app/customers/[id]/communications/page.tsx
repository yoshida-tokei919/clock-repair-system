import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { CustomerLineReply } from "@/components/customers/CustomerLineReply";
import { getCustomerCommunicationHub } from "@/lib/customer-communication-hub";
import { getLatestCommunicationAiBrief, resolveCustomerCommunicationAiContext } from "@/lib/communication-ai-brief";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

export default async function CustomerCommunicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const customerId = Number((await params).id);
  if (!Number.isSafeInteger(customerId) || customerId <= 0) notFound();
  const hub = await getCustomerCommunicationHub(prisma, customerId);
  if (!hub) notFound();
  const aiContext = resolveCustomerCommunicationAiContext(customerId, hub);
  const aiBrief = await getLatestCommunicationAiBrief(prisma, { targetType: "CUSTOMER", targetId: customerId }, aiContext);

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

      {hub.inquirySummaries.length > 0 && <section className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div>
          <h2 className="font-semibold text-blue-950">既存InquiryのAI要約</h2>
          <p className="mt-1 text-xs text-blue-800">各要約は、そのInquiryを最後にAI解析した時点の内容です。Customer全体の最新要約ではありません。</p>
          {hub.hasEarlierInquirySummaries && <p className="mt-1 text-xs text-blue-800">直近の要約のみ表示しています。これ以前のInquiry要約もあります。</p>}
        </div>
        <div className="space-y-2">
          {hub.inquirySummaries.map((item) => <article key={item.inquiryId} className="rounded border border-blue-100 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
              <Link className="font-medium text-blue-700 underline" href={`/inquiries/${item.inquiryId}/review`}>Inquiry #{item.inquiryId}</Link>
              <span>{item.status}{item.analysisCompletedAt ? ` · AI解析 ${formatDate(item.analysisCompletedAt)}` : ""} · 最終受信 {formatDate(item.lastReceivedAt)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-zinc-800">{item.summary}</p>
          </article>)}
        </div>
      </section>}

      {aiBrief && <section className={`space-y-3 rounded-lg border p-4 ${aiBrief.stale ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div>
          <h2 className="font-semibold">Customer AIブリーフ</h2>
          <p className="mt-1 text-xs text-zinc-600">{formatDate(aiBrief.createdAt)} 生成 · {aiBrief.modelProvider}/{aiBrief.modelName}{aiBrief.stale ? " · 新着または文脈変更あり（再生成が必要）" : " · 現在の表示文脈と一致"}</p>
        </div>
        {aiBrief.summary && <div><h3 className="text-sm font-medium">要約</h3><p className="mt-1 whitespace-pre-wrap text-sm">{aiBrief.summary}</p></div>}
        {stringArray(aiBrief.unresolvedItems).length > 0 && <div><h3 className="text-sm font-medium">未対応事項</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{stringArray(aiBrief.unresolvedItems).map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {stringArray(aiBrief.customerRequirements).length > 0 && <div><h3 className="text-sm font-medium">顧客指定</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{stringArray(aiBrief.customerRequirements).map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {stringArray(aiBrief.decisions).length > 0 && <div><h3 className="text-sm font-medium">決定事項</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{stringArray(aiBrief.decisions).map((item) => <li key={item}>{item}</li>)}</ul></div>}
      </section>}

      <CustomerLineReply
        customerId={customerId}
        destinations={hub.destinations}
        aiDraft={aiBrief?.replyDraft ? { id: aiBrief.id, text: aiBrief.replyDraft, stale: aiBrief.stale, createdAt: aiBrief.createdAt.toISOString() } : null}
      />

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
