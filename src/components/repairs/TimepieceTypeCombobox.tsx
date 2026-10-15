"use client";

import { useId, useState } from "react";
import { TIMEPIECE_TYPE_CHOICES } from "@/lib/timepiece-type";

export function TimepieceTypeCombobox({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="relative" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <input className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={value}
      role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={id} disabled={disabled}
      placeholder="空欄は腕時計" onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onChange={(event) => { onChange(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} />
    {open && <div id={id} role="listbox" className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
      {TIMEPIECE_TYPE_CHOICES.map((choice) => <button key={choice} type="button" role="option" aria-selected={choice === value}
        className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50" onMouseDown={(event) => event.preventDefault()}
        onClick={() => { onChange(choice); setOpen(false); }}>{choice}</button>)}
    </div>}
  </div>;
}
