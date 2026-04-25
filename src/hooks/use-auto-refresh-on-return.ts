"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useAutoRefreshOnReturn() {
    const router = useRouter();

    useEffect(() => {
        router.refresh();

        const handleFocus = () => router.refresh();
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                router.refresh();
            }
        };
        const handlePageShow = () => router.refresh();

        window.addEventListener("focus", handleFocus);
        window.addEventListener("pageshow", handlePageShow);
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("pageshow", handlePageShow);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [router]);
}
