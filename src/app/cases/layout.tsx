import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: '修理事例 | ヨシダ時計修理工房',
    description: 'ロレックス、オメガなどの時計修理事例をご紹介します。',
};

export default function CasesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
            {/* Public Header */}
            <header className="bg-white border-b sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
                    <div className="font-bold text-xl tracking-tighter">
                        <span className="text-blue-900">YOSHIDA</span> WATCH REPAIR
                    </div>
                    <nav className="hidden md:flex gap-6 text-sm font-medium">
                        <Link href="/cases/gallery" className="text-neutral-600 hover:text-blue-900 transition-colors">
                            修理事例ギャラリー
                        </Link>
                        <Link href="/cases/biz" className="text-neutral-600 hover:text-blue-900 transition-colors">
                            業者様向け価格事例
                        </Link>
                        <Link href="#" className="bg-blue-900 text-white px-4 py-2 rounded-full hover:bg-blue-800 transition-colors">
                            無料見積もり依頼
                        </Link>
                    </nav>
                </div>
            </header>

            <main>
                {children}
            </main>

            {/* Simple Footer */}
            <footer className="bg-neutral-900 text-white py-12 mt-20">
                <div className="max-w-7xl mx-auto px-4 md:px-8 text-center md:text-left">
                    <div className="grid md:grid-cols-3 gap-8">
                        <div>
                            <h3 className="font-bold text-lg mb-4">ヨシダ時計修理工房</h3>
                            <p className="text-neutral-400 text-sm">
                                〒651-1213<br />
                                神戸市北区広陵町1-162-1-401<br />
                                TEL: 090-2041-8275
                            </p>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4">Menu</h3>
                            <ul className="space-y-2 text-sm text-neutral-400">
                                <li><Link href="/cases/gallery">修理事例</Link></li>
                                <li><Link href="/cases/biz">業者様向け情報</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-xs text-neutral-500">
                        © 2026 Yoshida Watch Repair. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
}
