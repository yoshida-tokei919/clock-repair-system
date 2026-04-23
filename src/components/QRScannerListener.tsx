"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function QRScannerListener() {
    const router = useRouter();
    const bufferRef = useRef("");
    const lastKeyTimeRef = useRef(0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only process single characters or Enter
            if (!e.key || (e.key.length > 1 && e.key !== "Enter")) return;

            const now = Date.now();

            // If the delay between keys is too long (human typing speed), reset buffer
            // QR scanners typically fire events within a few milliseconds of each other.
            if (now - lastKeyTimeRef.current > 50) {
                bufferRef.current = "";
            }

            lastKeyTimeRef.current = now;

            if (e.key === "Enter") {
                processBuffer(bufferRef.current);
                bufferRef.current = "";
            } else {
                bufferRef.current += e.key;
                // Instant check while typing (for scanners that don't send Enter)
                processBuffer(bufferRef.current);
            }
        };

        const processBuffer = (buffer: string) => {
            // Look for the specific URL pattern in the system
            // Pattern: /repairs/123
            const match = buffer.match(/\/repairs\/(\d+)/);
            if (match && match[1]) {
                const repairId = match[1];
                // Navigate to the detail page
                router.push(`/repairs/${repairId}`);
                // Clear buffer to prevent double triggers
                bufferRef.current = "";
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [router]);

    return null; // This component doesn't render anything
}
