"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RepairComments } from "./RepairComments";

export function RepairCommentsEntry({ repairId, inquiryNumber, brand, model }: { repairId: number; inquiryNumber: string; brand: string; model: string }) {
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [focusMessageId, setFocusMessageId] = useState<number | undefined>();
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const messageId = /^#message-([1-9]\d*)$/.exec(window.location.hash)?.[1];
      if (query.matches) { setFocusMessageId(messageId ? Number(messageId) : undefined); setMobile(true); return; }
      router.replace(`/repairs/${repairId}?tab=line&conversation=comments${messageId ? `&messageId=${messageId}` : ""}`);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [repairId, router]);

  return <div className="mx-auto max-w-2xl p-3 md:hidden">
    {mobile && <><header className="rounded border bg-white p-4">
      <h1 className="text-lg font-bold">{inquiryNumber} のコメント</h1>
      <p className="text-sm text-zinc-600">{brand} {model}</p>
      <Link className="text-sm text-blue-700 underline" href={`/repairs/${repairId}`}>修理詳細を開く</Link>
    </header><RepairComments repairId={repairId} focusMessageId={focusMessageId} /></>}
  </div>;
}
