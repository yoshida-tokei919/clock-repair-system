"use client";

import { createContext, ReactNode, useContext, useState } from "react";

type AccordionContextValue = {
  openIndex: number;
  setOpenIndex: (index: number) => void;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

export function CustomerRepairAccordionRoot({ children }: { children: ReactNode }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="space-y-3">
      <AccordionContext.Provider value={{ openIndex, setOpenIndex }}>
        {children}
      </AccordionContext.Provider>
    </div>
  );
}

export function CustomerRepairAccordionItem({
  index,
  summary,
  children,
}: {
  index: number;
  summary: ReactNode;
  children: ReactNode;
}) {
  const context = useContext(AccordionContext);
  const isOpen = context?.openIndex === index;

  return (
    <section className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => context?.setOpenIndex(index)}
        className="w-full border-b border-slate-100 bg-white p-4 text-left hover:bg-blue-50"
        aria-expanded={isOpen}
      >
        {summary}
      </button>
      {isOpen && <div className="space-y-4 p-4">{children}</div>}
    </section>
  );
}
