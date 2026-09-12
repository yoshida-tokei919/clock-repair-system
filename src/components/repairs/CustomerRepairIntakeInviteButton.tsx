"use client";

import { useState } from "react";
import { Clipboard, Link as LinkIcon, Loader2 } from "lucide-react";

import { createCustomerRepairIntakeInviteAction } from "@/actions/repair-intake-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

type Invite = { token: string; expiresAt: string; reused: boolean };

export function CustomerRepairIntakeInviteButton({ customerId, className }: { customerId: number; className?: string }) {
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [open, setOpen] = useState(false);

  const createInvite = async () => {
    setPending(true);
    const result = await createCustomerRepairIntakeInviteAction(customerId);
    setPending(false);
    if (!result.success) {
      toast({ title: "受付リンクを発行できません", description: result.error, variant: "destructive" });
      return;
    }
    setInvite(result);
    setOpen(true);
  };

  const url = invite && typeof window !== "undefined"
    ? `${window.location.origin}/customer/intake/${invite.token}`
    : "";
  const expiresAt = invite ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invite.expiresAt)) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "受付リンクをコピーしました" });
    } catch {
      toast({ title: "コピーできませんでした", description: "リンクを選択してコピーしてください。", variant: "destructive" });
    }
  };

  return <>
    <Button type="button" variant="outline" className={className} disabled={pending} onClick={() => void createInvite()}>
      {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
      受付リンクを発行
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>受付リンクを発行</DialogTitle>
          <DialogDescription>{invite?.reused ? "有効な受付リンクを表示しています。" : "LINEでお客様へ送付する受付リンクです。"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={url} readOnly aria-label="受付リンク" onFocus={(event) => event.currentTarget.select()} />
          <p className="text-sm text-zinc-600">有効期限: {expiresAt}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>閉じる</Button>
          <Button type="button" onClick={() => void copy()}><Clipboard className="w-4 h-4 mr-2" />コピー</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
