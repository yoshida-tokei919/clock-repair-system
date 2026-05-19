"use client";

import { useEffect, useMemo, useState } from "react";

type ExportField =
  | "partnerRef"
  | "inquiryNumber"
  | "customerName"
  | "brand"
  | "model"
  | "reference"
  | "serialNumber"
  | "shopEstimate"
  | "customerEstimate"
  | "explanation"
  | "privateMemo";

type ExportRepair = {
  amountKey: string;
  privateMemoKey: string;
  partnerRef: string;
  inquiryNumber: string;
  customerName: string;
  brand: string;
  model: string;
  reference: string;
  serialNumber: string;
  shopEstimate: number;
  customerEstimate: string;
  explanation: string;
  privateMemo: string;
};

type Props = {
  repairs: ExportRepair[];
};

const exportFields: { key: ExportField; label: string }[] = [
  { key: "partnerRef", label: "管理番号" },
  { key: "inquiryNumber", label: "お問合番号" },
  { key: "customerName", label: "お客様名" },
  { key: "brand", label: "ブランド" },
  { key: "model", label: "モデル" },
  { key: "reference", label: "Ref" },
  { key: "serialNumber", label: "シリアルNo" },
  { key: "shopEstimate", label: "当店見積額" },
  { key: "customerEstimate", label: "ご案内金額" },
  { key: "explanation", label: "お客様への説明文" },
  { key: "privateMemo", label: "貴社専用メモ" },
];

const defaultFields: ExportField[] = exportFields.map((field) => field.key);
const multiplierOptions = Array.from({ length: 21 }, (_, index) => Number((1 + index * 0.1).toFixed(1)));

function csvValue(value: string | number) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function parseAmount(value: string) {
  const amount = Number(value.replace(/[^\d]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function yen(value: number | string) {
  const amount = typeof value === "number" ? value : parseAmount(value);
  if (!amount) return "¥";
  return `¥${amount.toLocaleString()}`;
}

function getRepairValue(
  repair: ExportRepair,
  field: ExportField,
  guideAmounts: Record<string, string>,
  privateMemos: Record<string, string>,
) {
  if (field === "customerEstimate") return guideAmounts[repair.amountKey] || "";
  if (field === "privateMemo") return privateMemos[repair.privateMemoKey] || repair.privateMemo || "";
  return repair[field];
}

function toCsv(
  repairs: ExportRepair[],
  selectedFields: ExportField[],
  guideAmounts: Record<string, string>,
  privateMemos: Record<string, string>,
) {
  const labels = exportFields.filter((field) => selectedFields.includes(field.key));
  return [
    labels.map((field) => csvValue(field.label)).join(","),
    ...repairs.map((repair) =>
      labels
        .map((field) => {
          const value = getRepairValue(repair, field.key, guideAmounts, privateMemos);
          return csvValue(typeof value === "number" ? value : value || "");
        })
        .join(","),
    ),
  ].join("\n");
}

function toMemoText(
  repairs: ExportRepair[],
  selectedFields: ExportField[],
  guideAmounts: Record<string, string>,
  privateMemos: Record<string, string>,
) {
  const labels = exportFields.filter((field) => selectedFields.includes(field.key));
  return repairs
    .map((repair) =>
      labels
        .map((field) => {
          const value = getRepairValue(repair, field.key, guideAmounts, privateMemos);
          const displayValue = field.key === "shopEstimate" || field.key === "customerEstimate" ? yen(value) : value || "";
          return `【${field.label}】\n${displayValue}`;
        })
        .join("\n\n"),
    )
    .join("\n\n---\n\n");
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function CustomerExportTools({ repairs }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState<ExportField[]>(defaultFields);
  const [guideAmounts, setGuideAmounts] = useState<Record<string, string>>({});
  const [privateMemos, setPrivateMemos] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    const nextMemos: Record<string, string> = {};
    repairs.forEach((repair) => {
      nextMemos[repair.privateMemoKey] = window.localStorage.getItem(repair.privateMemoKey) || "";
    });
    setGuideAmounts({});
    setPrivateMemos(nextMemos);
  }, [repairs]);

  useEffect(() => {
    const handleAmountChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; amount: string }>).detail;
      if (!detail?.key) return;
      setGuideAmounts((current) => ({ ...current, [detail.key]: detail.amount }));
    };
    const handleMemoChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; memo: string }>).detail;
      if (!detail?.key) return;
      setPrivateMemos((current) => ({ ...current, [detail.key]: detail.memo }));
    };

    window.addEventListener("customer-guide-amount-change", handleAmountChange);
    window.addEventListener("customer-private-memo-change", handleMemoChange);
    return () => {
      window.removeEventListener("customer-guide-amount-change", handleAmountChange);
      window.removeEventListener("customer-private-memo-change", handleMemoChange);
    };
  }, []);

  const csvText = useMemo(
    () => toCsv(repairs, selectedFields, guideAmounts, privateMemos),
    [repairs, selectedFields, guideAmounts, privateMemos],
  );
  const memoText = useMemo(
    () => toMemoText(repairs, selectedFields, guideAmounts, privateMemos),
    [repairs, selectedFields, guideAmounts, privateMemos],
  );

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 1800);
  };

  const copyText = async (text: string, doneMessage: string) => {
    try {
      await writeClipboard(text);
      showMessage(doneMessage);
    } catch {
      showMessage("コピーできませんでした");
    }
  };

  const toggleField = (field: ExportField) => {
    setSelectedFields((current) => {
      if (current.includes(field)) {
        const next = current.filter((item) => item !== field);
        return next.length > 0 ? next : current;
      }
      return [...current, field];
    });
  };

  const handleShare = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "貴社用データ",
          text: memoText,
        });
        showMessage("共有を起動しました");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyText(memoText, "メモ用テキストをコピーしました");
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
        aria-expanded={isOpen}
      >
        <div>
          <h2 className="text-lg font-bold text-slate-900">貴社用データ出力設定</h2>
          <p className="mt-1 text-base leading-6 text-slate-600">
            CSV / メモ出力用の設定です。この内容は当店には送信されません。
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-sm font-bold text-slate-600">
          {isOpen ? "閉じる" : "開く"}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {exportFields.map((field) => (
              <label
                key={field.key}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-base font-bold text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selectedFields.includes(field.key)}
                  onChange={() => toggleField(field.key)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
                <span>{field.label}</span>
              </label>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => copyText(csvText, "CSVをコピーしました")}
              className="h-12 rounded-lg bg-slate-900 px-4 text-base font-bold text-white hover:bg-slate-700"
            >
              CSVをコピー
            </button>
            <button
              type="button"
              onClick={() => copyText(memoText, "メモ用テキストをコピーしました")}
              className="h-12 rounded-lg border border-slate-300 bg-white px-4 text-base font-bold text-slate-800 hover:bg-slate-50"
            >
              メモ用テキストをコピー
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="h-12 rounded-lg border border-blue-200 bg-blue-50 px-4 text-base font-bold text-blue-700 hover:bg-blue-100"
            >
              メモアプリへ共有
            </button>
          </div>

          {message && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700">{message}</p>}
        </div>
      )}
    </section>
  );
}

export function CustomerGuideAmountInput({
  amountKey,
  baseAmount,
}: {
  amountKey: string;
  baseAmount: number;
}) {
  const [amount, setAmount] = useState("");
  const [selectedMultiplier, setSelectedMultiplier] = useState("");
  const guideAmount = parseAmount(amount);
  const addAmount = guideAmount && baseAmount ? guideAmount - baseAmount : 0;
  const ratio = guideAmount && baseAmount ? guideAmount / baseAmount : 0;

  useEffect(() => {
    setAmount("");
    setSelectedMultiplier("");
    window.dispatchEvent(
      new CustomEvent("customer-guide-amount-change", {
        detail: { key: amountKey, amount: "" },
      }),
    );
  }, [amountKey]);

  const saveAmount = (value: string) => {
    const normalized = value.replace(/[^\d]/g, "");
    setAmount(normalized);
    window.dispatchEvent(
      new CustomEvent("customer-guide-amount-change", {
        detail: { key: amountKey, amount: normalized },
      }),
    );
  };

  const handleAmountChange = (value: string) => {
    setSelectedMultiplier("");
    saveAmount(value);
  };

  const handleMultiplierChange = (value: string) => {
    setSelectedMultiplier(value);
    if (!value || baseAmount <= 0) {
      saveAmount("");
      return;
    }
    saveAmount(String(Math.round(baseAmount * Number(value))));
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <label className="block text-base font-bold text-slate-700">
          ご案内金額
          <div className="mt-1.5 flex items-center rounded-lg border border-slate-300 bg-white px-3 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-50">
            <span className="font-mono text-base font-bold text-slate-500">¥</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount ? Number(amount).toLocaleString() : ""}
              onChange={(event) => handleAmountChange(event.target.value)}
              className="h-10 min-w-0 flex-1 bg-transparent px-2 font-mono text-base font-bold text-slate-900 outline-none"
              placeholder=""
            />
          </div>
        </label>

        <label className="block text-base font-bold text-slate-700">
          目安
          <select
            value={selectedMultiplier}
            onChange={(event) => handleMultiplierChange(event.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-base font-bold text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-50"
          >
            <option value="">選択</option>
            {multiplierOptions.map((multiplier) => (
              <option key={multiplier} value={multiplier.toFixed(1)}>
                ×{multiplier.toFixed(1)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {guideAmount > 0 && baseAmount > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold">
          <span className="rounded bg-blue-50 px-2.5 py-1 text-blue-800">
            {addAmount >= 0 ? "+" : "-"}¥{Math.abs(addAmount).toLocaleString()}
          </span>
          <span className="rounded bg-blue-50 px-2.5 py-1 text-blue-800">×{ratio.toFixed(2)} 相当</span>
        </div>
      )}
      <p className="mt-2 text-sm leading-5 text-slate-500">
        この金額はこの端末のブラウザ内だけで利用され、当店には送信されません。
      </p>
    </section>
  );
}
