
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

export default async function EditRepairPage({ params }: { params: { id: string } }) {
    const repair = await prisma.repair.findUnique({
        where: { id: parseInt(params.id) },
        include: {
            customer: true,
            watch: true
        }
    });

    if (!repair) {
        notFound();
    }

    async function updateRepair(formData: FormData) {
        "use server";
        const id = parseInt(params.id);
        const endUserName = formData.get("endUserName") as string;
        const partnerRef = formData.get("partnerRef") as string;
        const serialNumber = formData.get("serialNumber") as string;

        await prisma.repair.update({
            where: { id },
            data: {
                endUserName,
                partnerRef,
                watch: {
                    update: {
                        serialNumber
                    }
                }
            }
        });

        revalidatePath(`/repairs/${id}`);
        redirect(`/repairs/${id}`);
    }

    return (
        <div className="min-h-screen bg-slate-50 p-8">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Link href={`/repairs/${params.id}`}>
                        <Button variant="ghost" size="sm">
                            <ArrowLeft className="w-4 h-4 mr-2" /> 戻る
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold">修理情報の編集</h1>
                </div>

                <form action={updateRepair}>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">基本情報の修正</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="inquiryNumber">管理番号 (固定)</Label>
                                <Input id="inquiryNumber" value={repair.inquiryNumber} disabled className="bg-slate-100" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="customer">取引先 / お客様</Label>
                                <Input id="customer" value={repair.customer.name} disabled className="bg-slate-100" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="endUserName">エンドユーザー名 (様)</Label>
                                <Input id="endUserName" name="endUserName" defaultValue={repair.endUserName || ""} placeholder="田中 太郎" />
                                <p className="text-xs text-slate-500">業者様案件の場合の、最終顧客名です。</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="partnerRef">貴社管理番号 (Their Ref)</Label>
                                <Input id="partnerRef" name="partnerRef" defaultValue={repair.partnerRef || ""} placeholder="A-12345" />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="serialNumber">時計製造番号 (Serial No.)</Label>
                                <Input id="serialNumber" name="serialNumber" defaultValue={repair.watch.serialNumber || ""} placeholder="V123456" />
                            </div>

                            <div className="pt-4 flex gap-2">
                                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                                    <Save className="w-4 h-4 mr-2" /> 変更を保存する
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </form>

                <div className="bg-amber-50 border border-amber-200 p-4 rounded-md text-sm text-amber-800">
                    <p className="font-bold mb-1">💡 ヒント</p>
                    <p>ブランド名やモデル名の変更、およびステータスの詳細な履歴編集については、現在開発中です。お急ぎの場合は管理者までご連絡ください。</p>
                </div>
            </div>
        </div>
    );
}
