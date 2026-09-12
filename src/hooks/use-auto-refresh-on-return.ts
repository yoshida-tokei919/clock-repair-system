"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type AutoRefreshOnReturnOptions = {
    refreshOnFocus?: boolean;
    refreshOnVisibility?: boolean;
};

export function useAutoRefreshOnReturn({
    refreshOnFocus = true,
    refreshOnVisibility = true,
}: AutoRefreshOnReturnOptions = {}) {
    const router = useRouter();

    useEffect(() => {
        router.refresh();

        const handleFocus = () => {
            if (refreshOnFocus) router.refresh();
        };
        const handleVisibility = () => {
            if (refreshOnVisibility && document.visibilityState === "visible") {
                router.refresh();
            }
        };
        const handlePageShow = () => router.refresh();
        const handlePopState = () => router.refresh();

        window.addEventListener("focus", handleFocus);
        window.addEventListener("pageshow", handlePageShow);
        window.addEventListener("popstate", handlePopState);
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("pageshow", handlePageShow);
            window.removeEventListener("popstate", handlePopState);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [refreshOnFocus, refreshOnVisibility, router]);
}
