import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Using Inter as requested
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "ヨシダ時計修理工房 | 時計修理・オーバーホール受付システム",
    description: "創業1919年。長年の技術でお預かりした時計を丁寧に修理。修理状況をリアルタイムで確認できる安心の管理システムです。",
    metadataBase: new URL("https://yoshidawatchrepair.com"),
    alternates: {
        canonical: "/",
    },
};

import { Toaster } from "@/components/ui/toaster"
import { Providers } from "@/components/Providers"
import { QRScannerListener } from "@/components/QRScannerListener"
import Sidebar from "@/components/layout/Sidebar"

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="ja">
            <body className={cn(inter.className, "antialiased min-h-screen bg-neutral-50")}>
                <Providers>
                    <QRScannerListener />
                    {children}
                    <Toaster />
                </Providers>
            </body>
        </html>
    );
}
