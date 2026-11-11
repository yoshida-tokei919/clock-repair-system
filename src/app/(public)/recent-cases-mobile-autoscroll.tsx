"use client";

import { useEffect } from "react";

const SPEED = 70; // pixels per second
const IDLE_MS = 1500;

export default function RecentCasesMobileAutoscroll() {
    useEffect(() => {
        const track = document.querySelector<HTMLElement>(".recent-cases-track");
        const firstSet = track?.querySelector<HTMLElement>(".recent-cases-set");
        if (!track || !firstSet || !firstSet.children.length) return;

        const mobile = window.matchMedia("(max-width: 768px)");
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = 0;
        let lastFrame = 0;
        let idleUntil = 0;
        let pointerDown = false;
        let autoPosition = track.scrollLeft;

        const pause = () => {
            idleUntil = performance.now() + IDLE_MS;
            lastFrame = 0;
        };
        const onScroll = () => {
            // Ignore scroll events caused by our own animation frames.
            if (Math.abs(track.scrollLeft - autoPosition) > 1) pause();
        };
        const onPointerDown = () => {
            pointerDown = true;
            pause();
        };
        const onPointerUp = () => {
            pointerDown = false;
            pause();
        };
        const tick = (now: number) => {
            frame = requestAnimationFrame(tick);
            if (pointerDown || now < idleUntil) {
                lastFrame = 0;
                return;
            }
            const setWidth = firstSet.getBoundingClientRect().width;
            if (setWidth <= 0) return;
            const delta = lastFrame ? Math.min(now - lastFrame, 50) * SPEED / 1000 : 0;
            lastFrame = now;
            const next = track.scrollLeft + delta;
            track.scrollLeft = next >= setWidth ? next - setWidth : next;
            autoPosition = track.scrollLeft;
        };
        const syncAnimation = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            lastFrame = 0;
            if (mobile.matches && !reducedMotion.matches && !document.hidden) {
                frame = requestAnimationFrame(tick);
            }
        };

        track.addEventListener("scroll", onScroll, { passive: true });
        track.addEventListener("pointerdown", onPointerDown, { passive: true });
        window.addEventListener("pointerup", onPointerUp);
        window.addEventListener("pointercancel", onPointerUp);
        mobile.addEventListener("change", syncAnimation);
        reducedMotion.addEventListener("change", syncAnimation);
        document.addEventListener("visibilitychange", syncAnimation);
        syncAnimation();
        return () => {
            cancelAnimationFrame(frame);
            mobile.removeEventListener("change", syncAnimation);
            reducedMotion.removeEventListener("change", syncAnimation);
            document.removeEventListener("visibilitychange", syncAnimation);
            track.removeEventListener("scroll", onScroll);
            track.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerUp);
        };
    }, []);

    return null;
}
