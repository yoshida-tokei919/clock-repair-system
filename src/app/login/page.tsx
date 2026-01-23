
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (res?.error) {
                setError('メールアドレスまたはパスワードが正しくありません');
            } else {
                router.push('/repairs');
            }
        } catch (err) {
            setError('ログイン中にエラーが発生しました');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-100 p-4">
            <Card className="w-full max-w-md shadow-lg border-none">
                <CardHeader className="space-y-1 text-center">
                    <div className="flex justify-center mb-2">
                        <div className="bg-blue-100 p-3 rounded-full">
                            <Lock className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold">社内管理システム</CardTitle>
                    <p className="text-sm text-slate-500">認証情報を入力してログインしてください</p>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-4">
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm font-medium border border-red-100">
                                {error}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="email">メールアドレス</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="admin@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">パスワード</Label>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="h-11"
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-700" disabled={loading}>
                            {loading ? 'ログイン中...' : 'ログイン'}
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
