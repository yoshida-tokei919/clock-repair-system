import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Using Inter as requested
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: "Clock Repair System",
    description: "Advanced Clock Repair Management",
};

import { Toaster } from "@/components/ui/toaster"
import { Providers } from "@/components/Providers"
import { QRScannerListener } from "@/components/QRScannerListener"

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
                </Providers>
                <Toaster />
            </body>
        </html>
    );
}
