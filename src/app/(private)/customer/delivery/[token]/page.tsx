import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getPublicRepairDeliveryPreference,
  RepairDeliveryPreferenceError,
} from "@/lib/repair-delivery-preference";
import { YUPURI_DELIVERY_TIME_OPTIONS } from "@/lib/yupuri-v3";
import { DeliveryPreferenceForm } from "./DeliveryPreferenceForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "配達日時のご希望 | ヨシダ時計修理工房",
  robots: { index: false, follow: false },
};

export default async function CustomerDeliveryPreferencePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const token = (await params).token;
  let initial;
  try {
    initial = await getPublicRepairDeliveryPreference(prisma, token);
  } catch (error) {
    if (error instanceof RepairDeliveryPreferenceError && error.status === 404) notFound();
    throw error;
  }
  const timeOptions = YUPURI_DELIVERY_TIME_OPTIONS
    .filter(option => option.value !== "指定なし")
    .map(option => ({ value: option.value, label: option.label }));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-lg space-y-6">
      <header className="space-y-2 text-center">
        <p className="text-sm font-medium text-slate-500">ヨシダ時計修理工房</p>
        <h1 className="text-2xl font-bold">配達日時のご希望</h1>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 space-y-2 text-sm leading-6 text-slate-700">
          <p>発送準備のため、配達日時のご希望をご回答ください。</p>
          <p className="font-medium">ご希望がない場合も「希望なし」を選択して回答をお願いします。</p>
        </div>
        <DeliveryPreferenceForm token={token} initial={initial} timeOptions={timeOptions} />
      </section>
      <p className="text-center text-xs text-slate-500">回答についてご不明な点がある場合は、LINEのトークからご連絡ください。</p>
    </div>
  </main>;
}
