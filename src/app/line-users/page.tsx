"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Link2, MessageCircle, Search, UserPlus } from "lucide-react";
import { getLineUsers, linkLineUserToCustomer, searchCustomersForLineUser } from "@/actions/line-user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { CustomerRepairIntakeInviteButton } from "@/components/repairs/CustomerRepairIntakeInviteButton";

type LineUser = Awaited<ReturnType<typeof getLineUsers>>[number];
type Customer = Awaited<ReturnType<typeof searchCustomersForLineUser>>[number];

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function customerName(customer: { name: string; companyName: string | null; type: string }) {
  return customer.type === "business" ? customer.companyName || customer.name : customer.name;
}

export default function LineUsersPage() {
  const [lineUsers, setLineUsers] = useState<LineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LineUser | null>(null);
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [linking, setLinking] = useState(false);

  const loadLineUsers = async () => {
    setLoading(true);
    setLineUsers(await getLineUsers());
    setLoading(false);
  };

  useEffect(() => { void loadLineUsers(); }, []);

  const chooseLineUser = (lineUser: LineUser) => {
    setSelected(lineUser);
    setQuery("");
    setCustomers([]);
    setSelectedCustomer(null);
  };

  const searchCustomers = async (value: string) => {
    setQuery(value);
    setSelectedCustomer(null);
    setCustomers(value.trim() ? await searchCustomersForLineUser(value) : []);
  };

  const linkCustomer = async () => {
    if (!selected || !selectedCustomer) return;
    setLinking(true);
    const result = await linkLineUserToCustomer(selected.lineUserId, selectedCustomer.id);
    setLinking(false);
    if (!result.success) {
      toast({ title: "紐付けできません", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "顧客へ紐付けました" });
    setSelected(null);
    await loadLineUsers();
  };

  const newCustomerHref = selected
    ? `/customers/new?lineUserId=${encodeURIComponent(selected.lineUserId)}&lineId=${encodeURIComponent(selected.lineUserId)}&lineDisplayName=${encodeURIComponent(selected.displayName || "")}`
    : "/customers/new";

  const unlinked = lineUsers.filter((lineUser) => lineUser.linkedCustomerId === null);
  const linked = lineUsers.filter((lineUser) => lineUser.linkedCustomerId !== null);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Link href="/admin"><Button variant="ghost" size="sm" className="gap-1 mb-2 -ml-2 text-zinc-500"><ArrowLeft className="w-4 h-4" /> ダッシュボードへ戻る</Button></Link>
          <h1 className="text-2xl font-bold text-zinc-900">LINEユーザー</h1>
          <p className="text-sm text-zinc-500">未紐付けのLINEユーザーを確認し、既存または新規の顧客へ明示的に紐付けます。</p>
        </div>
        <div className="text-sm text-zinc-500">未紐付け <span className="font-bold text-amber-700">{unlinked.length}件</span> / 紐付け済み {linked.length}件</div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-6 items-start">
        <div className="space-y-6">
          {loading ? <div className="h-40 rounded-lg bg-zinc-100 animate-pulse" /> : <>
            <LineUserSection title="未紐付け" emptyText="未紐付けのLINEユーザーはいません。" users={unlinked} selectedId={selected?.id} onSelect={chooseLineUser} />
            <LineUserSection title="紐付け済み" emptyText="紐付け済みのLINEユーザーはいません。" users={linked} selectedId={selected?.id} onSelect={chooseLineUser} />
          </>}
        </div>

        <Card className="p-5 xl:sticky xl:top-16">
          {!selected ? <p className="text-sm text-zinc-500">未紐付けのLINEユーザーを選択すると、顧客の検索・紐付け、または新規顧客登録を行えます。</p> : selected.linkedCustomerId !== null ? (
            <div className="space-y-4"><p className="font-bold">すでに紐付け済みです</p><p className="text-sm text-zinc-500">解除・付け替えは今回の対象外です。</p>{selected.linkedCustomer?.type === "individual" && <CustomerRepairIntakeInviteButton customerId={selected.linkedCustomerId} className="w-full" />}</div>
          ) : <div className="space-y-4">
            <div><p className="font-bold">{selected.displayName || "表示名未取得"}</p><p className="text-xs text-zinc-500 break-all mt-1">{selected.lineUserId}</p></div>
            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-semibold">既存顧客へ紐付け</p>
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" /><Input className="pl-9" value={query} onChange={(event) => void searchCustomers(event.target.value)} placeholder="氏名・会社名・管理番号・電話番号" /></div>
              {customers.length > 0 && <div className="border rounded-md divide-y max-h-52 overflow-y-auto">{customers.map((customer) => <button type="button" key={customer.id} onClick={() => setSelectedCustomer(customer)} className={`block w-full text-left p-3 text-sm hover:bg-zinc-50 ${selectedCustomer?.id === customer.id ? "bg-blue-50" : ""}`}><div className="font-medium">{customerName(customer)}</div><div className="text-xs text-zinc-500 mt-1">{customer.type === "business" && customer.prefix ? `${customer.prefix}-` : ""}{customer.id} {customer.phone ? `・${customer.phone}` : ""}{customer.lineId ? "・LINE登録済み" : ""}</div></button>)}</div>}
              <Button className="w-full" disabled={!selectedCustomer || linking} onClick={() => void linkCustomer()}><Link2 className="w-4 h-4 mr-2" />{linking ? "紐付け中..." : "この顧客に紐付け"}</Button>
            </div>
            <div className="border-t pt-4 space-y-2"><p className="text-sm font-semibold">新規顧客として登録</p><p className="text-xs text-zinc-500">既存の顧客登録画面を開きます。LINE表示名は確認用の仮入力です。</p><Link href={newCustomerHref}><Button variant="outline" className="w-full"><UserPlus className="w-4 h-4 mr-2" />新規顧客として登録</Button></Link></div>
          </div>}
        </Card>
      </div>
    </div>
  );
}

function LineUserSection({ title, emptyText, users, selectedId, onSelect }: { title: string; emptyText: string; users: LineUser[]; selectedId?: number; onSelect: (user: LineUser) => void }) {
  return <section className="space-y-3"><h2 className="font-bold text-zinc-800">{title}</h2>{users.length === 0 ? <div className="border border-dashed rounded-lg p-6 text-sm text-zinc-500">{emptyText}</div> : <div className="space-y-2">{users.map((user) => <button type="button" key={user.id} onClick={() => onSelect(user)} className={`w-full text-left border rounded-lg p-4 hover:border-blue-300 transition-colors ${selectedId === user.id ? "border-blue-500 ring-1 ring-blue-200" : "border-zinc-200"}`}><div className="flex gap-3 justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" /><span className="font-bold truncate">{user.displayName || "表示名未取得"}</span>{user.linkedCustomerId === null ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0">未紐付け</Badge> : <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0">紐付け済み</Badge>}</div><p className="text-xs text-zinc-400 mt-2 break-all">{user.lineUserId}</p></div><div className="shrink-0 text-right text-xs text-zinc-500 space-y-1"><div>初回 {formatDate(user.firstReceivedAt)}</div><div>最終 {formatDate(user.lastReceivedAt)}</div><div>event: {user.lastEventType}</div>{user.linkedCustomer && <div className="font-medium text-zinc-700">顧客: {customerName(user.linkedCustomer)}</div>}</div></div></button>)}</div>}</section>;
}
