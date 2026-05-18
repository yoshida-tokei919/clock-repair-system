"use client";

import { useEffect, useMemo, useState } from "react";

type ExportField =
  | "inquiryNumber"
  | "customerName"
  | "brand"
  | "model"
  | "reference"
  | "shopEstimate"
  | "customerEstimate"
  | "status"
  | "contact"
  | "memo";

type ExportRepair = {
  amountKey: string;
  inquiryNumber: string;
  customerName: string;
  brand: string;
  model: string;
  reference: string;
  shopEstimate: number;
  customerEstimate: string;
  status: string;
  contact: string;
  memo: string;
};

type Props = {
  repairs: ExportRepair[];
};

const exportFields: { key: ExportField; label: string }[] = [
  { key: "inquiryNumber", label: "案件番号" },
  { key: "customerName", label: "顧客名" },
  { key: "brand", label: "ブランド" },
  { key: "model", label: "モデル" },
  { key: "reference", label: "Ref" },
  { key: "shopEstimate", label: "当店見積額" },
  { key: "customerEstimate", label: "ご案内金額" },
  { key: "status", label: "ステータス" },
  { key: "contact", label: "連絡先" },
  { key: "memo", label: "対応メモ" },
];

const defaultFields: ExportField[] = exportFields.map((field) => field.key);

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

function getRepairValue(repair: ExportRepair, field: ExportField, guideAmounts: Record<string, string>) {
  if (field === "customerEstimate") return guideAmounts[repair.amountKey] || "";
  return repair[field];
}

function toCsv(repairs: ExportRepair[], selectedFields: ExportField[], guideAmounts: Record<string, string>) {
  const labels = exportFields.filter((field) => selectedFields.includes(field.key));
  return [
    labels.map((field) => csvValue(field.label)).join(","),
    ...repairs.map((repair) =>
      labels
        .map((field) => {
          const value = getRepairValue(repair, field.key, guideAmounts);
          return csvValue(typeof value === "number" ? value : value || "");
        })
        .join(","),
    ),
  ].join("\n");
}

function toMemoText(repairs: ExportRepair[], selectedFields: ExportField[], guideAmounts: Record<string, string>) {
  return repairs
    .map((repair) => {
      const lines: string[] = [];
      if (selectedFields.includes("inquiryNumber") || selectedFields.includes("customerName")) {
        lines.push(
          `${selectedFields.includes("inquiryNumber") ? repair.inquiryNumber : ""}${
            selectedFields.includes("inquiryNumber") && selectedFields.includes("customerName") ? " / " : ""
          }${selectedFields.includes("customerName") ? `${repair.customerName || "-"} 様` : ""}`,
        );
      }
      if (selectedFields.includes("brand") || selectedFields.includes("model") || selectedFields.includes("reference")) {
        const watchLine = [
          selectedFields.includes("brand") ? repair.brand : "",
          selectedFields.includes("model") ? repair.model : "",
          selectedFields.includes("reference") && repair.reference ? `Ref.${repair.reference}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        if (watchLine) lines.push(watchLine);
      }
      if (selectedFields.includes("shopEstimate")) {
        lines.push("", "【当店見積額】", yen(repair.shopEstimate));
      }
      if (selectedFields.includes("customerEstimate")) {
        lines.push("", "【ご案内金額】", yen(guideAmounts[repair.amountKey] || ""));
      }
      if (selectedFields.includes("status")) {
        lines.push("", "【ステータス】", repair.status || "-");
      }
      if (selectedFields.includes("contact")) {
        lines.push("", "【連絡先】", repair.contact || "TEL:");
      }
      if (selectedFields.includes("memo")) {
        lines.push("", "【対応メモ】", repair.memo || "");
      }
      return lines.join("\n");
    })
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
  const [message, setMessage] = useState("");

  useEffect(() => {
    const next: Record<string, string> = {};
    repairs.forEach((repair) => {
      next[repair.amountKey] = window.localStorage.getItem(repair.amountKey) || "";
    });
    setGuideAmounts(next);
  }, [repairs]);

  useEffect(() => {
    const handleAmountChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key: string; amount: string }>).detail;
      if (!detail?.key) return;
      setGuideAmounts((current) => ({ ...current, [detail.key]: detail.amount }));
    };
    window.addEventListener("customer-guide-amount-change", handleAmountChange);
    return () => window.removeEventListener("customer-guide-amount-change", handleAmountChange);
  }, []);

  const csvText = useMemo(() => toCsv(repairs, selectedFields, guideAmounts), [repairs, selectedFields, guideAmounts]);
  const memoText = useMemo(
    () => toMemoText(repairs, selectedFields, guideAmounts),
    [repairs, selectedFields, guideAmounts],
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
          <p className="mt-1 text-sm leading-6 text-slate-600">
            出力項目を選択して、CSVやメモ用テキストとして利用できます。
            <br />
            この内容は当店には送信されません。
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600">
          {isOpen ? "閉じる" : "開く"}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-100 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {exportFields.map((field) => (
              <label
                key={field.key}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700"
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

          {message && (
            <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm font-bold text-green-700">{message}</p>
          )}
        </div>
      )}
    </section>
  );
}

const multiplierOptions = Array.from({ length: 21 }, (_, index) => Number((1 + index * 0.1).toFixed(1)));

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
    setAmount(window.localStorage.getItem(amountKey) || "");
    setSelectedMultiplier("");
  }, [amountKey]);

  const saveAmount = (value: string) => {
    const normalized = value.replace(/[^\d]/g, "");
    setAmount(normalized);
    if (normalized) {
      window.localStorage.setItem(amountKey, normalized);
    } else {
      window.localStorage.removeItem(amountKey);
    }
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
    if (!value || baseAmount <= 0) return;
    saveAmount(String(Math.round(baseAmount * Number(value))));
  };

  return (
    <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 shadow-sm">
      <div className="space-y-3">
        <label className="block text-sm font-bold text-slate-700">
          ご案内金額
          <div className="mt-2 flex items-center rounded-lg border border-emerald-200 bg-white px-3 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-100">
            <span className="font-mono text-lg font-bold text-slate-500">¥</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount ? Number(amount).toLocaleString() : ""}
              onChange={(event) => handleAmountChange(event.target.value)}
              className="h-12 min-w-0 flex-1 bg-transparent px-2 font-mono text-xl font-bold text-slate-900 outline-none"
              placeholder="0"
            />
          </div>
        </label>

        {guideAmount > 0 && baseAmount > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-emerald-800">
              {addAmount >= 0 ? "+" : "-"}¥{Math.abs(addAmount).toLocaleString()}
            </span>
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-emerald-800">
              ×{ratio.toFixed(2)} 相当
            </span>
          </div>
        )}

        <div>
          <div className="text-sm font-bold text-slate-700">目安</div>
          <div className="mt-2 max-h-36 snap-y overflow-y-auto rounded-lg border border-emerald-200 bg-white p-2">
            <div className="grid gap-2">
              {multiplierOptions.map((multiplier) => {
                const value = multiplier.toFixed(1);
                const selected = selectedMultiplier === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleMultiplierChange(value)}
                    className={`h-11 snap-center rounded-lg border px-3 font-mono text-base font-bold transition ${
                      selected
                        ? "border-blue-300 bg-blue-50 text-blue-700"
                        : "border-transparent bg-slate-50 text-slate-700 hover:border-emerald-200 hover:bg-emerald-50"
                    }`}
                    aria-pressed={selected}
                  >
                    ×{value}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-emerald-900">
        この金額はこの端末のブラウザ内だけで利用され、当店には送信されません。
      </p>
    </section>
  );
}
