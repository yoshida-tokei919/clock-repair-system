"use client";

import React from "react";
import { ArrowLeft, Save, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Link from "next/link";

export default function NewCustomerPage() {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 font-sans text-zinc-900 dark:text-zinc-100">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/admin">
                            <Button variant="ghost" size="sm" className="gap-1">
                                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                            </Button>
                        </Link>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-200">
                        新規顧客登録 / New Customer
                    </h1>
                </div>

                {/* Main Form Card */}
                <Card className="border-t-4 border-t-blue-600 shadow-md">
                    <CardHeader>
                        <div className="flex items-center gap-4 border-b border-zinc-100 pb-4">
                            <div className="flex items-center gap-2">
                                <input type="radio" name="ctype" id="type-business" className="w-4 h-4 text-blue-600" defaultChecked />
                                <Label htmlFor="type-business" className="text-base cursor-pointer flex items-center gap-2">
                                    <Building2 className="w-4 h-4" /> 業者 (Business)
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="radio" name="ctype" id="type-individual" className="w-4 h-4 text-blue-600" />
                                <Label htmlFor="type-individual" className="text-base cursor-pointer flex items-center gap-2">
                                    <User className="w-4 h-4" /> 個人 (Individual)
                                </Label>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Left Col: Basic Info */}
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>顧客名 / 担当者名 (Name) <span className="text-red-500">*</span></Label>
                                    <Input placeholder="山田 太郎" />
                                </div>
                                <div className="space-y-2">
                                    <Label>フリガナ (Kana)</Label>
                                    <Input placeholder="ヤマダ タロウ" />
                                </div>
                                <div className="space-y-2">
                                    <Label>会社名 / 屋号 (Company Name)</Label>
                                    <Input placeholder="株式会社ヨシダ時計 (任意)" />
                                </div>
                                <div className="space-y-2">
                                    <Label>顧客ランク (Priority Rank)</Label>
                                    <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                        <option value="1">Rank 1 (General)</option>
                                        <option value="2">Rank 2 (Regular)</option>
                                        <option value="3">Rank 3 (VIP)</option>
                                        <option value="4">Rank 4 (Partner)</option>
                                        <option value="5">Rank 5 (Special)</option>
                                    </select>
                                    <p className="text-xs text-muted-foreground">※ランクが高いほどスケジューリングで優先されます</p>
                                </div>
                            </div>

                            {/* Right Col: Contact Info */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="space-y-2 col-span-1">
                                        <Label>郵便番号 (Zip)</Label>
                                        <Input placeholder="000-0000" />
                                    </div>
                                    <div className="space-y-2 col-span-2">
                                        <Button variant="outline" className="mt-8 w-full">住所自動入力</Button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>住所 (Address)</Label>
                                    <Input placeholder="東京都..." />
                                </div>
                                <div className="space-y-2">
                                    <Label>電話番号 (Phone)</Label>
                                    <Input placeholder="090-0000-0000" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Email</Label>
                                    <Input type="email" placeholder="example@email.com" />
                                </div>
                                <div className="space-y-2">
                                    <Label>LINE ID</Label>
                                    <Input placeholder="@xxxxx" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-zinc-100">
                            <Button className="w-full md:w-auto gap-2 bg-blue-600 hover:bg-blue-700">
                                <Save className="w-4 h-4" /> 登録する (Register)
                            </Button>
                        </div>

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
