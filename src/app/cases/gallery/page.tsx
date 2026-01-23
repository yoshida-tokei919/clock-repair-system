import { prisma } from "@/lib/prisma";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Clock, Hammer } from "lucide-react";

export const revalidate = 60; // ISR: Revalidate every 60 seconds

export default async function GalleryPage() {
    const repairs = await prisma.repair.findMany({
        where: {
            isPublicB2C: true,
            status: { not: 'canceled' }
        },
        include: {
            watch: { include: { brand: true, model: true } },
            photos: true,
            estimate: { include: { items: true } }
        },
        orderBy: { deliveryDateActual: 'desc' },
        take: 20
    });

    return (
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-12">
            <div className="text-center mb-16">
                <h1 className="text-3xl font-bold mb-4 tracking-tight">修理事例ギャラリー</h1>
                <p className="text-neutral-500">
                    大切な時計が蘇る瞬間をご覧ください。<br />
                    オーバーホールから外装研磨まで、熟練の職人が手掛けた実績です。
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {repairs.map((repair) => {
                    const heroImage = repair.photos.length > 0
                        ? `/uploads/${repair.photos[0].storageKey}`
                        : "https://placehold.co/600x400/e2e8f0/64748b?text=No+Image";

                    const title = repair.publicTitle || `${repair.watch.brand.name} ${repair.watch.model.name} 修理`;

                    // Deriving generic tags from estimate items if available
                    const isOverhaul = repair.estimate?.items.some(i => i.itemName.includes("オーバーホール") || i.itemName.includes("分解掃除"));
                    const isPolishing = repair.estimate?.items.some(i => i.itemName.includes("研磨") || i.itemName.includes("新品仕上げ"));

                    return (
                        <div key={repair.id} className="group bg-white rounded-xl overflow-hidden border hover:shadow-xl transition-all duration-300">
                            {/* Image Container */}
                            <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
                                <img
                                    src={heroImage}
                                    alt={title}
                                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                    <span className="text-white text-sm font-bold flex items-center">
                                        詳細を見る &rarr;
                                    </span>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-5">
                                <div className="flex gap-2 mb-3">
                                    {isOverhaul && <Badge variant="secondary" className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100">オーバーホール</Badge>}
                                    {isPolishing && <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100">外装研磨</Badge>}
                                    {!isOverhaul && !isPolishing && <Badge variant="secondary" className="text-xs">修理</Badge>}
                                </div>
                                <h3 className="font-bold text-lg mb-2 text-neutral-800 line-clamp-2">
                                    {title}
                                </h3>
                                <p className="text-sm text-neutral-500 line-clamp-2 mb-4">
                                    {repair.workSummary || "お預かりした時計の修理が完了いたしました。"}
                                </p>
                                <div className="flex items-center text-xs text-neutral-400 pt-4 border-t">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {repair.deliveryDateActual ? repair.deliveryDateActual.toLocaleDateString("ja-JP") : "近日公開"}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
