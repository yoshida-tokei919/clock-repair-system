"use client";

import { useState } from "react";
import { Clipboard, Link as LinkIcon, Loader2 } from "lucide-react";

import { createCustomerRepairIntakeInviteAction, createLineUserRepairIntakeInviteAction } from "@/actions/repair-intake-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";

type Invite = { token: string; expiresAt: string; reused: boolean };
type Props = { customerId?: number; lineUserId?: number; className?: string };

export function CustomerRepairIntakeInviteButton({ customerId, lineUserId, className }: Props) {
  const [pending, setPending] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [open, setOpen] = useState(false);

  const createInvite = async () => {
    if ((customerId == null && lineUserId == null) || (customerId != null && lineUserId != null)) {
      toast({ title: "受付リンクを発行できません", description: "顧客またはLINEユーザーのいずれか一方を指定してください。", variant: "destructive" });
      return;
    }

    setPending(true);
    const result = customerId != null
      ? await createCustomerRepairIntakeInviteAction(customerId)
      : await createLineUserRepairIntakeInviteAction(lineUserId!);
    setPending(false);
    if (!result.success) {
      toast({ title: "受付リンクを発行できません", description: result.error, variant: "destructive" });
      return;
    }
    setInvite(result);
    setOpen(true);
  };

  const url = invite && typeof window !== "undefined" ? `${window.location.origin}/customer/intake/${invite.token}` : "";
  const expiresAt = invite ? new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }).format(new Date(invite.expiresAt)) : "";
  const lineMessage = !url ? "" : customerId != null ? `このたびもお問い合わせいただきありがとうございます。

下記リンクから、修理品の送付受付をお願いいたします。

ご登録済みのお客様情報は可能な範囲で入力済みです。
内容をご確認いただき、変更がある場合は修正してください。

${url}

入力完了後、時計の送付先をご案内いたします。

※リンクの有効期限は7日間です。` : `修理品の送付受付に必要な情報をご入力ください。

下記リンクから、お名前・ご住所・時計の情報をご入力いただけます。
入力完了後、時計の送付先をご案内いたします。

${url}

※リンクの有効期限は7日間です。`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "受付リンクをコピーしました" });
    } catch {
      toast({ title: "コピーできませんでした", description: "リンクを選択してコピーしてください。", variant: "destructive" });
    }
  };

  const copyLineMessage = async () => {
    try {
      await navigator.clipboard.writeText(lineMessage);
      toast({ title: "受付案内文をコピーしました" });
    } catch {
      toast({ title: "コピーできませんでした", description: "案内文を選択してコピーしてください。", variant: "destructive" });
    }
  };

  return <>
    <Button type="button" variant="outline" className={className} disabled={pending} onClick={() => void createInvite()}>
      {pending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
      修理受付リンクを発行
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>修理受付リンク</DialogTitle>
          <DialogDescription>{invite?.reused ? "有効な修理受付リンクを表示しています。" : lineUserId != null ? "LINEで初回のお客様へ送る修理受付リンクです。" : "LINEでお客様へ送る修理受付リンクです。"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={url} readOnly aria-label="修理受付リンク" onFocus={(event) => event.currentTarget.select()} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-700">LINE送信用案内文</p>
            <textarea value={lineMessage} readOnly aria-label="LINE送信用案内文" onFocus={(event) => event.currentTarget.select()} className="min-h-44 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 shadow-sm" />
          </div>
          <p className="text-sm text-zinc-600">有効期限: {expiresAt}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>閉じる</Button>
          <Button type="button" variant="outline" onClick={() => void copyUrl()}><Clipboard className="w-4 h-4 mr-2" />URLのみコピー</Button>
          <Button type="button" onClick={() => void copyLineMessage()}><Clipboard className="w-4 h-4 mr-2" />案内文をコピー</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
