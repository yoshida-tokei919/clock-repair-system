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
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 md:px-8">
                    <Link href="/" className="flex min-w-0 items-center gap-[13px] text-[1.32rem] font-semibold text-[#15213a] focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900 md:gap-[22px] md:text-[2.16rem]" aria-label="ヨシダ時計修理工房 ホーム">
                        <img src="/img/logo.png" alt="" className="h-[58px] w-auto shrink-0 object-contain md:h-[115px]" />
                        <span>ヨシダ時計修理工房</span>
                    </Link>
                    <nav aria-label="修理事例メニュー" className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium xl:order-2 xl:ml-auto xl:w-auto">
                        <Link href="/cases/gallery" className="text-slate-700 transition-colors hover:text-blue-900 focus-visible:underline">
                            修理事例ギャラリー
                        </Link>
                        <Link href="/cases/biz" className="text-slate-700 transition-colors hover:text-blue-900 focus-visible:underline">
                            業者様向け価格事例
                        </Link>
                    </nav>
                    <a href="https://lin.ee/3C0XfJW" className="order-2 ml-auto inline-flex min-h-10 items-center gap-2 rounded-full bg-[#06c755] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#05a847] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 xl:order-3 xl:ml-0">
                        <img src="/img/line-brand-icon.png" alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                        LINEで相談
                    </a>
                </div>
            </header>

            <main>
                {children}
            </main>

            <footer className="mt-20 border-t border-white/10 bg-[#15213a] px-5 py-[60px] text-center text-white/60">
                <div className="mx-auto max-w-7xl">
                    <img src="/img/logo.png" alt="ヨシダ時計修理工房 ロゴ" className="mx-auto mb-[15px] h-[35px] w-auto opacity-80" />
                    <div className="mb-5 text-[1.2rem] text-white">ヨシダ時計修理工房</div>
                    <nav aria-label="フッターメニュー" className="mb-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
                        <Link href="/" className="hover:underline">ホーム</Link>
                        <Link href="/cases/gallery" className="hover:underline">修理事例</Link>
                        <Link href="/cases/biz" className="hover:underline">業者様向け情報</Link>
                    </nav>
                    <p className="mb-3 text-sm"><Link href="/commercial-disclosure" className="text-white/70 underline underline-offset-[3px]">特定商取引法に基づく表記</Link></p>
                    <p className="text-[0.85rem]">© 2026 ヨシダ時計修理工房 All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
