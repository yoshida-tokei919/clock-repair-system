"use client";

import React, { useState } from "react";
import { ArrowLeft, Save, Building2, User, Star, AlertTriangle, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCustomer, checkDuplicateCustomer } from "@/actions/customer-actions";
import { toast } from "@/components/ui/use-toast";

export default function NewCustomerPage() {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);

    // フォームの状態
    const [type, setType] = useState<"business" | "individual">("business");
    const [name, setName] = useState(""); // 個人名、または担当者名
    const [companyName, setCompanyName] = useState(""); // 屋号・会社名
    const [kana, setKana] = useState("");
    const [rank, setRank] = useState(1);
    const [zipCode, setZipCode] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [lineId, setLineId] = useState("");
    const [prefix, setPrefix] = useState("");

    // 重複チェック用
    const [showDupDialog, setShowDupDialog] = useState(false);
    const [dupResults, setDupResults] = useState<any[]>([]);

    // バリデーション関数 (漢字、ひらがな、カタカナ、半角英数のみ)
    const isValidText = (str: string) => /^[ぁ-んァ-ヶ\u4E00-\u9FFF a-zA-Z0-9ー\s\d．・（）\(\)]+$/.test(str);
    const isAlphaNum = (str: string) => /^[a-zA-Z0-9]+$/.test(str);

    const validateForm = () => {
        const targetName = type === "business" ? companyName : name;
        if (!targetName) return "名前を入力してください";
        if (!isValidText(targetName)) return "特殊な記号は使用できません。";

        if (type === "business") {
            if (!prefix) return "プレフィックスを入力してください";
            if (!isAlphaNum(prefix)) return "プレフィックスは半角英数字のみ使用可能です";
        }
        return null;
    };

    const handleSaveRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        const error = validateForm();
        if (error) {
            toast({ title: "入力エラー", description: error, variant: "destructive" });
            return;
        }

        // 重複チェック
        const targetName = type === "business" ? companyName : name;
        const targetPrefix = type === "business" ? prefix : "C";

        setIsSaving(true);
        const matches = await checkDuplicateCustomer(targetName, targetPrefix);

        if (matches.length > 0) {
            setDupResults(matches);
            setShowDupDialog(true);
            setIsSaving(false);
            return;
        }

        await performSave();
    };

    const performSave = async () => {
        setIsSaving(true);
        const res = await createCustomer({
            type, name, companyName, kana, rank, zipCode, address, phone, email, lineId,
            prefix: type === "business" ? prefix : "C"
        });

        if (res.success) {
            toast({ title: "登録完了", description: "新規顧客を登録しました。" });
            router.push("/admin");
        } else {
            alert("エラー: " + res.error);
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 font-sans">
            <div className="max-w-4xl mx-auto space-y-6">

                <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1">
                        <ArrowLeft className="w-4 h-4" /> 戻る
                    </Button>
                    <h1 className="text-2xl font-bold text-zinc-800">新規顧客登録</h1>
                </div>

                <form onSubmit={handleSaveRequest}>
                    <Card className="border-t-4 border-t-blue-600 shadow-md">
                        <CardHeader>
                            <div className="flex items-center gap-4 border-b border-zinc-100 pb-4">
                                <button type="button" onClick={() => setType("business")} className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold transition-all ${type === 'business' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
                                    <Building2 className="w-4 h-4" /> 業者 (B2B)
                                </button>
                                <button type="button" onClick={() => setType("individual")} className={`flex items-center gap-2 px-4 py-2 rounded-md font-bold transition-all ${type === 'individual' ? 'bg-green-600 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
                                    <User className="w-4 h-4" /> 一般個人 (B2C)
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 pt-6">

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* 左列：名前・プレフィックス */}
                                <div className="space-y-4">
                                    {type === "business" ? (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label className="font-bold">屋号・会社名 <span className="text-red-500">*</span></Label>
                                                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="例：吉田時計店" className="bg-white" required />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-bold">プレフィックス <span className="text-red-500">*</span></Label>
                                                <Input value={prefix} onChange={e => setPrefix(e.target.value.toUpperCase())} placeholder="例：JK" className="font-mono uppercase bg-white" maxLength={3} />
                                                <p className="text-[10px] text-zinc-400 italic">※半角英数字のみ可（修理番号 {prefix || "JK"}-001 となります）</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <Label className="text-xs text-zinc-500">担当者名 (任意)</Label>
                                                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="やまだ たろう" className="bg-white border-zinc-200" />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs text-zinc-500">フリガナ (任意)</Label>
                                                    <Input value={kana} onChange={e => setKana(e.target.value)} placeholder="ヤマダ タロウ" className="bg-white border-zinc-200" />
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <Label className="font-bold">お名前 <span className="text-red-500">*</span></Label>
                                                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="やまだ 太郎" className="bg-white" required />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs text-zinc-500">フリガナ (任意)</Label>
                                                    <Input value={kana} onChange={e => setKana(e.target.value)} placeholder="ヤマダ タロウ" className="bg-white border-zinc-200" />
                                                </div>
                                            </div>
                                            <div className="p-3 bg-green-50 rounded-md border border-green-100">
                                                <Label className="text-xs font-bold text-green-700">自動割り当てプレフィックス:</Label>
                                                <div className="text-xl font-mono font-bold text-green-800">C</div>
                                                <p className="text-[10px] text-green-600/70 mt-1 italic">※一般のお客様は一律「C-001」形式の番号となります</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* 右列：連絡先・属性 */}
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="font-bold text-zinc-700">顧客重要度</Label>
                                        <div className="flex items-center gap-2">
                                            {[1, 2, 3, 4, 5].map(v => (
                                                <Star key={v} className={`w-6 h-6 cursor-pointer ${v <= rank ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-200'}`} onClick={() => setRank(v)} />
                                            ))}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-zinc-700">電話番号</Label>
                                            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="09000000000" className="bg-white" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-zinc-700">メールアドレス</Label>
                                            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" className="bg-white" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                                                <MessageCircle className="w-3 h-3 text-emerald-500" /> LINE ID
                                            </Label>
                                            <Input value={lineId} onChange={e => setLineId(e.target.value)} placeholder="line_id" className="bg-white" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold text-zinc-700">郵便番号</Label>
                                            <Input value={zipCode} onChange={e => setZipCode(e.target.value)} placeholder="000-0000" className="bg-white" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-zinc-700">住所</Label>
                                        <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="東京都..." className="bg-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4 border-t border-zinc-100">
                                <Button type="submit" disabled={isSaving} className="w-full md:w-auto gap-2 bg-blue-600 hover:bg-blue-700 font-bold px-10 h-11">
                                    <Save className="w-4 h-4" /> {isSaving ? "チェック中..." : "保存して登録"}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>

                {/* 重複警告ダイアログ */}
                <Dialog open={showDupDialog} onOpenChange={setShowDupDialog}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-amber-600">
                                <AlertTriangle className="w-5 h-5" /> 重複の可能性があります
                            </DialogTitle>
                            <DialogDescription className="pt-2 text-zinc-600">
                                入力された内容（屋号・名前、またはプレフィックス）が既に登録されています。
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3 py-4">
                            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">一致した既存の顧客:</p>
                            {dupResults.map(c => (
                                <div key={c.id} className="p-3 bg-zinc-50 border rounded-md text-sm flex justify-between items-center">
                                    <div>
                                        <div className="font-bold text-zinc-900">{c.name}</div>
                                        <div className="text-xs text-zinc-500">Prefix: <span className="font-mono font-bold">{c.prefix}</span></div>
                                    </div>
                                    <div className="text-[10px] bg-zinc-200 px-2 py-0.5 rounded text-zinc-600 font-bold">登録済</div>
                                </div>
                            ))}
                        </div>
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="ghost" onClick={() => setShowDupDialog(false)}>修正する</Button>
                            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => { setShowDupDialog(false); performSave(); }}>
                                被っていても登録する
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </div>
    );
}
