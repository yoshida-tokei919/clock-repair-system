"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { setB2BSession } from "@/actions/auth-actions";

export default function B2BLoginPage() {
    const [password, setPassword] = useState("");
    const router = useRouter();
    const { toast } = useToast();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const result = await setB2BSession(password);

        if (result.success) {
            toast({ title: "認証成功", description: "B2Bページへ移動します" });
            router.push("/cases/biz");
        } else {
            toast({ title: "認証失敗", description: "パスワードが間違っています", variant: "destructive" });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto bg-blue-100 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                        <Lock className="w-6 h-6 text-blue-600" />
                    </div>
                    <CardTitle>業者様向けページ</CardTitle>
                    <CardDescription>
                        閲覧には専用のパスワードが必要です。<br />
                        公式LINEよりお名刺をお送り頂いた業者様に発行しております。
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <Input
                            type="password"
                            placeholder="パスワードを入力"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="text-center text-lg tracking-widest"
                        />
                        <Button type="submit" className="w-full bg-blue-900 hover:bg-blue-800">
                            認証して閲覧する
                        </Button>
                        <div className="text-center mt-4">
                            <a href="https://lin.ee/3C0XfJW" target="_blank" className="text-xs text-blue-600 hover:underline">
                                パスワードをお持ちでない方はこちら (公式LINE)
                            </a>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
