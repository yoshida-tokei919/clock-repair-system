"use client";

import React, { useState } from "react";
import { ArrowLeft, Camera, Printer, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Mock Data for Autocomplete
const BRANDS = ["ROLEX", "OMEGA", "Cartier", "SEIKO", "PATEK PHILIPPE", "AUDEMARS PIGUET"];
const MODELS = {
    "ROLEX": ["Daytona", "Submariner", "Datejust", "Explorer", "GMT-Master II"],
    "OMEGA": ["Speedmaster", "Seamaster", "Constellation"],
};

export default function RepairEntryPage() {
    const [brand, setBrand] = useState("");
    const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);

    const handleBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setBrand(val);
        if (val.length > 0) {
            setBrandSuggestions(BRANDS.filter(b => b.toLowerCase().includes(val.toLowerCase())));
        } else {
            setBrandSuggestions([]);
        }
    };

    const selectBrand = (b: string) => {
        setBrand(b);
        setBrandSuggestions([]);
    };

    return (
        <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 p-2 font-sans text-zinc-900 dark:text-zinc-100">
            {/* Top Bar: Action Buttons & Navigation */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                        <ArrowLeft className="w-4 h-4" /> Back
                    </Button>
                    <h1 className="text-lg font-bold tracking-tight text-zinc-700 dark:text-zinc-200">
                        新規修理受付 / New Repair Entry
                    </h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-2">
                        <Printer className="w-4 h-4" /> 帳票出力
                    </Button>
                    <Button className="h-8 gap-2 bg-blue-700 hover:bg-blue-800 text-white">
                        <Save className="w-4 h-4" /> 保存して登録
                    </Button>
                </div>
            </div>

            {/* Main Form Container - Dense Layout */}
            <div className="grid grid-cols-12 gap-2 h-full">

                {/* Header Strip: Customer Info (F-01) - Spans Full Width */}
                <Card className="col-span-12 p-3 bg-white dark:bg-zinc-900 shadow-sm border-zinc-300 dark:border-zinc-800 rounded-sm">
                    <div className="grid grid-cols-12 gap-4 items-end">
                        <div className="col-span-3">
                            <Label className="label-dense">取引先名 (Customer / Vendor)</Label>
                            <div className="relative">
                                <Search className="absolute left-2 top-2 w-4 h-4 text-zinc-400" />
                                <Input className="pl-8 bg-zinc-50 border-zinc-300" placeholder="検索: 名前/TEL..." />
                            </div>
                        </div>
                        <div className="col-span-2">
                            <Label className="label-dense">顧客区分</Label>
                            <select className="flex h-9 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                <option>業者 (B2B)</option>
                                <option>個人 (B2C)</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <Label className="label-dense">管理No (Admin ID)</Label>
                            <Input className="bg-zinc-100 text-center font-mono" readOnly value="S-00045" />
                        </div>
                        <div className="col-span-2">
                            {/* Spacer or extra info */}
                        </div>
                        <div className="col-span-3 flex justify-end items-center gap-2">
                            <span className="text-sm font-medium text-zinc-500">Status:</span>
                            <span className="px-3 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-full">受付 (Reception)</span>
                        </div>
                    </div>
                </Card>

                {/* Left Column: Watch Details (F-02) */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-2">
                    <Card className="flex-1 p-3 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 rounded-sm space-y-3">
                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">お客様名 (End User)</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="入力..." />
                        </div>

                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">受付日 (Date)</Label>
                            <Input type="date" className="input-dense bg-zinc-50" defaultValue={new Date().toISOString().split('T')[0]} />
                        </div>

                        <hr className="border-dashed border-zinc-200 my-2" />

                        {/* Smart Input Fields */}
                        <div className="space-y-0.5 relative">
                            <Label className="label-dense text-blue-800 font-bold">ブランド (Brand)</Label>
                            <Input
                                className="input-dense bg-yellow-50/50 border-blue-200 focus:border-blue-500 font-bold"
                                placeholder="ROLEX, OMEGA..."
                                value={brand}
                                onChange={handleBrandChange}
                            />
                            {/* Autocomplete Dropdown */}
                            {brandSuggestions.length > 0 && (
                                <div className="absolute z-50 w-full bg-white border border-zinc-200 shadow-lg rounded-md mt-1 overflow-hidden">
                                    {brandSuggestions.map(b => (
                                        <div
                                            key={b}
                                            className="px-3 py-2 text-sm hover:bg-blue-50 cursor-pointer"
                                            onClick={() => selectBrand(b)}
                                        >
                                            {b}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">モデル名 (Model)</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="Daytona..." />
                        </div>

                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">Ref No.</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="116500LN" />
                        </div>

                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">Serial No.</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="R123456" />
                        </div>

                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">Caliber</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="4130" />
                        </div>

                        <div className="space-y-0.5 pt-2">
                            <Label className="label-dense text-zinc-600">外装チェック (Exterior)</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="傷の状態など" />
                        </div>
                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">付属品 (Accessories)</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="箱、保証書..." />
                        </div>
                        <div className="space-y-0.5">
                            <Label className="label-dense text-zinc-600">動作確認 (Check)</Label>
                            <Input className="input-dense bg-zinc-50" placeholder="不動、遅れ..." />
                        </div>
                    </Card>
                </div>

                {/* Center Column: Request & Notes */}
                <div className="col-span-12 lg:col-span-5 flex flex-col gap-2">
                    <Card className="flex-1 p-0 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-800 rounded-sm overflow-hidden flex flex-col">
                        <div className="p-2 bg-zinc-100 border-b border-zinc-200">
                            <Label className="font-bold text-zinc-700">依頼内容 (Request)</Label>
                        </div>
                        <textarea className="flex-1 w-full p-2 text-sm resize-none focus:outline-none border-b border-zinc-100" placeholder="オーバーホール、ポリッシュなど..."></textarea>

                        <div className="p-2 bg-zinc-100 border-y border-zinc-200">
                            <Label className="font-bold text-zinc-700">店舗連絡事項 (Internal Notes)</Label>
                        </div>
                        <textarea className="flex-1 w-full p-2 text-sm resize-none focus:outline-none" placeholder="社内共有事項..."></textarea>
                    </Card>

                    {/* Estimation / Costs Block */}
                    <Card className="h-64 p-0 bg-white border-zinc-300 rounded-sm flex flex-col">
                        <div className="grid grid-cols-12 gap-0 text-xs font-bold bg-zinc-100 border-b border-zinc-300 text-zinc-600">
                            <div className="col-span-6 p-2 border-r border-zinc-300">項目 (Item)</div>
                            <div className="col-span-2 p-2 border-r border-zinc-300">単価</div>
                            <div className="col-span-2 p-2 border-r border-zinc-300">数量</div>
                            <div className="col-span-2 p-2">金額</div>
                        </div>
                        <div className="flex-1 overflow-auto bg-white">
                            {/* Row 1 */}
                            <div className="grid grid-cols-12 gap-0 text-sm border-b border-zinc-100 hover:bg-zinc-50">
                                <div className="col-span-6 p-1"><Input className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-1" defaultValue="オーバーホール基本技術料" /></div>
                                <div className="col-span-2 p-1"><Input className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-1 text-right" defaultValue="45,000" /></div>
                                <div className="col-span-2 p-1"><Input className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-1 text-center" defaultValue="1" /></div>
                                <div className="col-span-2 p-1 flex items-center justify-end px-2 text-zinc-700">45,000</div>
                            </div>
                            {/* Row 2 */}
                            <div className="grid grid-cols-12 gap-0 text-sm border-b border-zinc-100 hover:bg-zinc-50">
                                <div className="col-span-6 p-1"><Input className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-1" defaultValue="パッキン交換" /></div>
                                <div className="col-span-2 p-1"><Input className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-1 text-right" defaultValue="1,000" /></div>
                                <div className="col-span-2 p-1"><Input className="h-6 text-xs border-none shadow-none focus-visible:ring-0 px-1 text-center" defaultValue="1" /></div>
                                <div className="col-span-2 p-1 flex items-center justify-end px-2 text-zinc-700">1,000</div>
                            </div>
                        </div>
                        {/* Totals */}
                        <div className="bg-zinc-50 border-t border-zinc-300 p-2 grid grid-cols-2 gap-4">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-zinc-500">部品小計:</span>
                                <span className="text-sm">¥1,000</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-zinc-500 ring-offset-2">合計 (Total):</span>
                                <span className="text-lg font-bold text-zinc-900 border-b-2 border-zinc-400">¥49,500</span>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right Column: Photo (F-03) */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-2">
                    <Card className="flex-1 bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 rounded-sm relative group overflow-hidden flex items-center justify-center">
                        <div className="text-center p-4">
                            <Camera className="w-12 h-12 text-zinc-400 mx-auto mb-2" />
                            <p className="text-sm text-zinc-500 font-medium">Drag & Drop Photo Here</p>
                            <p className="text-xs text-zinc-400 mt-1">or click to upload</p>
                        </div>

                        {/* Top Right "Web Publish" Switch Mock */}
                        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur px-3 py-1 rounded-full shadow-sm flex items-center gap-2 border border-zinc-200">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs font-bold text-zinc-700">WEB公開 ON</span>
                        </div>
                    </Card>

                    {/* Photo Thumbnails List Placeholder */}
                    <div className="h-24 grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="bg-zinc-300 rounded-sm border border-zinc-400/50"></div>
                        ))}
                    </div>

                    <Button variant="outline" className="w-full border-dashed border-zinc-400 text-zinc-600 hover:bg-zinc-100">
                        + 写真を追加 (Add Photos)
                    </Button>
                </div>

            </div>
        </div>
    );
}
