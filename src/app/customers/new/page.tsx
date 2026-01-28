"use client";

import React, { useState } from "react";
import { ArrowLeft, Save, Building2, User, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCustomer } from "@/actions/customer-actions";
import { toast } from "@/components/ui/use-toast";

export default function NewCustomerPage() {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);

    // フォームの状態
    const [type, setType] = useState<"business" | "individual">("business");
    const [name, setName] = useState(""); // 個人名、または担当者名
    const [kana, setKana] = useState("");
    const [companyName, setCompanyName] = useState(""); // 屋号・会社名
    const [rank, setRank] = useState(1);
    const [zipCode, setZipCode] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [lineId, setLineId] = useState("");

    // 取引先設定 (B2Bのみ)
    const [isPartner, setIsPartner] = useState(false);
    const [prefix, setPrefix] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // バリデーション: 業者の場合は屋号を必須に、個人の場合はお名前を必須にする
        if (type === "business" && !companyName) {
            toast({ title: "入力エラー", description: "業者登録の場合は『屋号・会社名』が必須です", variant: "destructive" });
            return;
        }
        if (type === "individual" && !name) {
            toast({ title: "入力エラー", description: "個人登録の場合は『お名前』が必須です", variant: "destructive" });
            return;
        }

        setIsSaving(true);
        const res = await createCustomer({
            type, name, kana, companyName, rank, zipCode, address, phone, email, lineId, isPartner, prefix
        });

        if (res.success) {
            toast({ title: "登録完了", description: "新規顧客を登録しました。" });
            router.push("/admin");
        } else {
            alert("エラーが発生しました: " + res.error);
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 font-sans text-zinc-900 dark:text-zinc-100">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* ヘッダー */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/admin">
                            <Button variant="ghost" size="sm" className="gap-1">
                                <ArrowLeft className="w-4 h-4" /> 戻る
                            </Button>
                        </Link>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-200">
                        新規顧客登録
                    </h1>
                </div>

                <form onSubmit={handleSubmit}>
                    <Card className="border-t-4 border-t-blue-600 shadow-md">
                        <CardHeader>
                            <div className="flex items-center gap-4 border-b border-zinc-100 pb-4">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="ctype"
                                        id="type-business"
                                        className="w-4 h-4 text-blue-600"
                                        checked={type === "business"}
                                        onChange={() => setType("business")}
                                    />
                                    <Label htmlFor="type-business" className="text-base cursor-pointer flex items-center gap-2 font-bold">
                                        <Building2 className="w-4 h-4" /> 業者 (B2B)
                                    </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="ctype"
                                        id="type-individual"
                                        className="w-4 h-4 text-blue-600"
                                        checked={type === "individual"}
                                        onChange={() => setType("individual")}
                                    />
                                    <Label htmlFor="type-individual" className="text-base cursor-pointer flex items-center gap-2 font-bold">
                                        <User className="w-4 h-4" /> 一般個人 (B2C)
                                    </Label>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* 左側: 基本情報 */}
                                <div className="space-y-4">
                                    {type === "business" ? (
                                        <>
                                            <div className="space-y-2">
                                                <Label className="font-bold flex items-center gap-1">屋号・会社名 <span className="text-red-500">*</span></Label>
                                                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="例：株式会社ヨシダ時計" className="bg-white border-zinc-200" required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-zinc-500 text-xs">担当者名 (任意)</Label>
                                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="例：山田 太郎" className="bg-white border-zinc-200" />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-2">
                                                <Label className="font-bold flex items-center gap-1">お名前 <span className="text-red-500">*</span></Label>
                                                <Input value={name} onChange={e => setName(e.target.value)} placeholder="例：山田 太郎" className="bg-white border-zinc-200" required />
                                            </div>
                                        </>
                                    )}
                                    <div className="space-y-2">
                                        <Label className="text-zinc-500 text-xs">フリガナ</Label>
                                        <Input value={kana} onChange={e => setKana(e.target.value)} placeholder="ヤマダ タロウ" className="bg-white border-zinc-200" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-zinc-500 text-xs">重要度 (ランク)</Label>
                                        <div className="flex items-center gap-2">
                                            {[1, 2, 3, 4, 5].map(v => (
                                                <Star
                                                    key={v}
                                                    className={`w-6 h-6 cursor-pointer ${v <= rank ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-200'}`}
                                                    onClick={() => setRank(v)}
                                                />
                                            ))}
                                            <span className="ml-2 text-sm font-bold text-zinc-600">Rank {rank}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 右側: 連絡先情報 */}
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-zinc-500 text-xs">郵便番号</Label>
                                            <Input value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="123-4567" className="bg-white border-zinc-200" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-zinc-500 text-xs font-bold text-zinc-700">住所</Label>
                                            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="東京都..." className="bg-white border-zinc-200" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="font-bold">電話番号</Label>
                                        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="090-0000-0000" className="bg-white border-zinc-200" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-zinc-500 text-xs">Email / LINE ID</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="メール" className="bg-white border-zinc-200" />
                                            <Input value={lineId} onChange={e => setLineId(e.target.value)} placeholder="LINE ID" className="bg-white border-zinc-200" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 取引先＆プレフィックス設定 (業者のみ表示) */}
                            {type === "business" && (
                                <Card className="p-4 bg-blue-50/50 border-blue-100 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="isPartner"
                                                checked={isPartner}
                                                onChange={e => setIsPartner(e.target.checked)}
                                                className="w-4 h-4 accent-blue-600"
                                            />
                                            <Label htmlFor="isPartner" className="font-bold text-blue-800 cursor-pointer">
                                                公式パートナー（取引先）として管理する
                                            </Label>
                                        </div>
                                        {isPartner && (
                                            <div className="flex items-center gap-3">
                                                <Label className="text-xs font-bold text-blue-700">管理番号接頭辞 (Prefix):</Label>
                                                <Input
                                                    value={prefix}
                                                    onChange={e => setPrefix(e.target.value.toUpperCase())}
                                                    placeholder="例：JK"
                                                    className="w-20 h-9 font-mono text-center font-bold uppercase border-blue-200 focus:ring-blue-400"
                                                    maxLength={3}
                                                    required
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-[10px] text-blue-600/70 italic">
                                        ※パートナー設定を有効にすると、この顧客からの依頼に対して、独自の番号（例: {prefix || 'JK'}-001）を自動で振ることができます。
                                    </p>
                                </Card>
                            )}

                            <div className="flex justify-end pt-4 border-t border-zinc-100">
                                <Button
                                    type="submit"
                                    disabled={isSaving}
                                    className="w-full md:w-auto gap-2 bg-blue-600 hover:bg-blue-700 font-bold px-10 h-11"
                                >
                                    <Save className="w-4 h-4" /> {isSaving ? "登録中..." : "この内容で登録する"}
                                </Button>
                            </div>

                        </CardContent>
                    </Card>
                </form>
            </div>
        </div>
    );
}
