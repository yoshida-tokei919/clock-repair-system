import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { cn } from "@/lib/utils";
import { PublicAnalytics } from "@/components/analytics/PublicAnalytics";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "時計修理・オーバーホール｜ヨシダ時計修理工房【神戸】",
  description: "神戸のヨシダ時計修理工房。修理歴20年・1級時計修理技能士が腕時計のオーバーホール・修理に対応。他店で断られた時計も、部品調達・加工・製作を含めて修理の可能性を検討します。LINEで事前に費用感をご相談いただけます。",
  metadataBase: new URL("https://yoshidawatchrepair.com"),
  referrer: "no-referrer",
  formatDetection: { telephone: false },
};

export default function PublicRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className={cn(inter.className, "antialiased min-h-screen bg-neutral-50")}>
        <PublicAnalytics />
        {children}
      </body>
    </html>
  );
}
