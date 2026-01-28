"use client";

import React, { useEffect, useState } from "react";
import { getCustomers, deleteCustomer } from "@/actions/customer-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search, UserPlus, Edit, Trash2, Phone, Mail, MapPin, Building2, User, MessageCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";

export default function CustomerListPage() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [isLoading, setIsLoading] = useState(true);

    const loadCustomers = async (query = "") => {
        setIsLoading(true);
        const data = await getCustomers(query);
        setCustomers(data);
        setIsLoading(false);
    };

    useEffect(() => {
        loadCustomers();
    }, []);

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`「${name}」様を削除してもよろしいですか？\n※修理履歴がある場合は削除できません。`)) return;

        const res = await deleteCustomer(id);
        if (res.success) {
            toast({ title: "削除完了", description: "顧客情報を削除しました。" });
            loadCustomers(search);
        } else {
            alert(res.error);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <Link href="/admin">
                        <Button variant="ghost" size="sm" className="gap-1 mb-2 -ml-2 text-zinc-500">
                            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold text-zinc-900">顧客管理</h1>
                    <p className="text-zinc-500 text-sm">登録されている顧客および取引先の一覧です。</p>
                </div>
                <Link href="/customers/new">
                    <Button className="bg-blue-600 hover:bg-blue-700">
                        <UserPlus className="w-4 h-4 mr-2" /> 新規顧客登録
                    </Button>
                </Link>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <Input
                    placeholder="名前、電話番号、メールアドレスで検索..."
                    className="pl-10 h-10 border-zinc-200"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        loadCustomers(e.target.value);
                    }}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="h-40 bg-zinc-100 animate-pulse rounded-lg" />
                    ))
                ) : (
                    customers.map((c) => (
                        <Card key={c.id} className="p-4 hover:shadow-md transition-shadow relative group border-zinc-200">
                            <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className={cn(
                                        "w-8 h-8 rounded-full flex items-center justify-center",
                                        c.type === 'business' ? "bg-blue-50 text-blue-600" : "bg-zinc-50 text-zinc-600"
                                    )}>
                                        {c.type === 'business' ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <div className="font-bold text-zinc-900 flex items-center gap-2">
                                            {c.name}
                                            {c.isPartner && <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0 text-[10px] h-4">Partner</Badge>}
                                        </div>
                                        <div className="text-[10px] text-zinc-400 uppercase tracking-tighter">
                                            ID: {c.type === 'business' && c.prefix ? `${c.prefix}-` : ""}{c.id}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-zinc-500 mt-3">
                                <div className="flex items-center gap-2">
                                    <Phone className="w-3 h-3" /> {c.phone || "-"}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Mail className="w-3 h-3" /> {c.email || "-"}
                                </div>
                                <div className="flex items-center gap-2">
                                    <MessageCircle className="w-3 h-3 text-emerald-500" /> {c.lineId || "-"}
                                </div>
                                <div className="flex items-center gap-2 truncate">
                                    <MapPin className="w-3 h-3" /> {c.address || "-"}
                                </div>
                            </div>

                            <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Link href={`/customers/${c.id}/edit`}>
                                    <Button variant="outline" size="icon" className="h-8 w-8 text-zinc-600">
                                        <Edit className="w-4 h-4" />
                                    </Button>
                                </Link>
                                <Button variant="outline" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(c.id, c.name)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>

            {!isLoading && customers.length === 0 && (
                <div className="text-center py-20 bg-zinc-50 rounded-lg border-2 border-dashed border-zinc-200">
                    <p className="text-zinc-400 italic">該当する顧客が見つかりません</p>
                </div>
            )}
        </div>
    );
}

// Helper
function cn(...classes: string[]) {
    return classes.filter(Boolean).join(" ");
}
