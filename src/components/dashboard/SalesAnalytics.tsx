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
    { name: "Rolex", value: 45, color: "#006039" },
    { name: "Omega", value: 25, color: "#C5001A" },
    { name: "Seiko", value: 15, color: "#232323" },
    { name: "Other", value: 15, color: "#888888" },
];

export function SalesAnalytics() {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>売上推移</CardTitle>
                </CardHeader>
                <CardContent className="pl-2">
                    <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={salesData}>
                            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `¥${value / 10000}M`} />
                            <Tooltip formatter={(value: number | undefined) => `¥${(value || 0).toLocaleString()}`} cursor={{ fill: 'transparent' }} />
                            <Bar dataKey="total" fill="#0f172a" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
            <Card className="col-span-3">
                <CardHeader>
                    <CardTitle>ブランド別シェア</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                        <PieChart>
                            <Pie
                                data={brandData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {brandData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-4 mt-4 text-sm">
                        {brandData.map(b => (
                            <div key={b.name} className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: b.color }}></div>
                                {b.name}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
