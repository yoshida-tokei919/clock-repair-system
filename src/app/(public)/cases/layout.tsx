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
            <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-8">
                    <Link href="/" className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-900 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 sm:text-base" aria-label="ヨシダ時計修理工房 ホーム">
                        <img src="/img/logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
                        <span>ヨシダ時計修理工房</span>
                    </Link>
                    <nav aria-label="修理事例メニュー" className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium md:order-2 md:ml-auto md:w-auto">
                        <Link href="/cases/gallery" className="text-slate-700 transition-colors hover:text-blue-900 focus-visible:underline">
                            修理事例ギャラリー
                        </Link>
                        <Link href="/cases/biz" className="text-slate-700 transition-colors hover:text-blue-900 focus-visible:underline">
                            業者様向け価格事例
                        </Link>
                    </nav>
                    <a href="https://lin.ee/3C0XfJW" className="order-2 ml-auto inline-flex min-h-10 items-center gap-2 rounded-full bg-[#06c755] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#05a847] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 md:order-3 md:ml-0">
                        <img src="/img/line-brand-icon.png" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                        LINEで相談
                    </a>
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
                                所在地の詳細は防犯上の理由により非公開です。<br />
                                修理依頼時はLINEでの事前相談後に送付先をご案内します。
                            </p>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg mb-4">Menu</h3>
                            <ul className="space-y-2 text-sm text-neutral-400">
                                <li><Link href="/">ホーム</Link></li>
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
