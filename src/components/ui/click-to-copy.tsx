'use client';

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClickToCopyProps {
    text: string;
    children: React.ReactNode;
    className?: string;
}

export function ClickToCopy({ text, children, className }: ClickToCopyProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy!", err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={cn(
                "group relative flex items-center transition-all active:scale-95 text-left",
                className
            )}
            title="クリックしてコピー"
        >
            {children}
            <div className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {copied ? (
                    <Check className="w-2.5 h-2.5 text-green-500" />
                ) : (
                    <Copy className="w-2.5 h-2.5 text-zinc-400" />
                )}
            </div>

            {copied && (
                <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-1.5 py-0.5 rounded shadow-lg animate-in fade-in slide-in-from-bottom-1">
                    Copied!
                </span>
            )}
        </button>
    );
}
