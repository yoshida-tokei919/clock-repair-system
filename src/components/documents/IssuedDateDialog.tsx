"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatIssuedDate } from "@/lib/document-issued-date";

export function IssuedDateDialog({ open, title, initialDate, busy, onClose, onConfirm }: {
  open: boolean; title: string; initialDate?: string; busy?: boolean;
  onClose: () => void; onConfirm: (date: string | undefined) => void;
}) {
  const [date, setDate] = useState("");
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (open) { setDate(initialDate ?? formatIssuedDate(new Date())); setEdited(false); }
  }, [open, initialDate]);
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <label className="space-y-2 text-sm">発行日（日本時間）
        <input type="date" value={date} onChange={event => { setDate(event.target.value); setEdited(true); }}
          className="block rounded border px-3 py-2" required />
      </label>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>キャンセル</Button>
        <Button onClick={() => onConfirm(edited ? date : initialDate)} disabled={busy || !date}>
          {busy ? "処理中..." : "確定"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
