"use client";

import { createContext, ReactNode, useContext, useState } from "react";

type AccordionContextValue = {
  openIndex: number;
  setOpenIndex: (index: number) => void;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

export function CustomerRepairAccordionRoot({ children, initialOpenIndex = 0 }: { children: ReactNode; initialOpenIndex?: number }) {
  const [openIndex, setOpenIndex] = useState(initialOpenIndex);

  return (
    <AccordionContext.Provider value={{ openIndex, setOpenIndex }}>
      <div className="space-y-3">{children}</div>
    </AccordionContext.Provider>
  );
}

export function CustomerRepairAccordionItem({
  index,
  summary,
  children,
  statusBand,
}: {
  index: number;
  summary: ReactNode;
  children: ReactNode;
  statusBand?: ReactNode;
}) {
  const context = useContext(AccordionContext);
  const isOpen = context?.openIndex === index;

  return (
    <section className={`overflow-hidden rounded-xl border bg-white shadow-sm ${isOpen ? "border-blue-400" : "border-slate-200"}`}>
      {statusBand}
      <button
        type="button"
        onClick={() => context?.setOpenIndex(index)}
        className="flex w-full items-center gap-3 bg-white p-4 text-left hover:bg-blue-50"
        aria-expanded={isOpen}
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <span className="shrink-0 text-2xl font-bold text-slate-700" aria-hidden="true">
          {isOpen ? "⌃" : "⌄"}
        </span>
      </button>
      {isOpen && <div className="space-y-4 border-t border-slate-100 p-4">{children}</div>}
    </section>
  );
}
