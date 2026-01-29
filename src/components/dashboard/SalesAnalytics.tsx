"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";

const salesData = [
    { name: "1月", total: 450000 },
    { name: "2月", total: 320000 },
    { name: "3月", total: 580000 },
    { name: "4月", total: 490000 },
    { name: "5月", total: 720000 },
    { name: "6月", total: 680000 },
];

const brandData = [
    { name: "Rolex", count: 45, color: "#006039", href: "/repairs?q=Rolex" },
    { name: "Omega", count: 25, color: "#C5001A", href: "/repairs?q=Omega" },
    { name: "Seiko", count: 15, color: "#232323", href: "/repairs?q=Seiko" },
    { name: "Cartier", count: 12, color: "#000000", href: "/repairs?q=Cartier" },
    { name: "Other", count: 15, color: "#888888", href: "/repairs" },
];

export function SalesAnalytics() {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">売上推移</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={salesData}>
                            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `¥${value / 10000}M`} />
                            <Tooltip formatter={(value: number | undefined) => `¥${(value || 0).toLocaleString()}`} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
                            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card className="col-span-3 shadow-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">ブランド別シェア</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={brandData} layout="vertical" margin={{ left: 0, right: 30 }}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" stroke="#888888" fontSize={12} axisLine={false} tickLine={false} width={60} />
                            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} formatter={(value: number | string | undefined) => [`${value ?? 0} 件`, '受注数']} />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                {brandData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
