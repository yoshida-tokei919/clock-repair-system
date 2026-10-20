"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const MEASUREMENT_ID = "G-TZK3912PSM";
const OPT_OUT_KEY = "yoshida_public_analytics_opt_out";
const PUBLIC_PAGES = new Set([
  "/", "/about-technician", "/commercial-disclosure",
  "/difficult-repair", "/line-consultation", "/parts-sourcing",
  "/price-quality", "/reassurance", "/repair-flow", "/waterproof-check",
]);

type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: Gtag;
  __yoshidaAnalyticsLoaded?: boolean;
};

function isPublicPage(path: string): boolean {
  return PUBLIC_PAGES.has(path) || path === "/cases" || path.startsWith("/cases/");
}

function isOptedOut(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("analytics_opt_out") === "1") {
      localStorage.setItem(OPT_OUT_KEY, "1");
      url.searchParams.delete("analytics_opt_out");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    // If storage is unavailable, fail closed rather than tracking this browser.
    return true;
  }
}

function ensureTag(): Gtag {
  const w = window as AnalyticsWindow;
  if (!w.dataLayer) w.dataLayer = [];
  if (!w.gtag) w.gtag = (...args: unknown[]) => { w.dataLayer?.push(args); };
  if (!w.__yoshidaAnalyticsLoaded) {
    w.__yoshidaAnalyticsLoaded = true;
    w.gtag("js", new Date());
    w.gtag("config", MEASUREMENT_ID, { send_page_view: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
    document.head.appendChild(script);
  }
  return w.gtag;
}

export function PublicAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isPublicPage(pathname) || isOptedOut()) return;
    const gtag = ensureTag();
    // Never send query strings: search terms and customer data must not reach GA4.
    gtag("event", "page_view", {
      page_location: window.location.origin + pathname,
      page_path: pathname,
      page_title: document.title,
    });
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const path = window.location.pathname;
      if (!isPublicPage(path) || isOptedOut()) return;
      try {
        const destination = new URL(anchor.href);
        if (
          destination.hostname === "lin.ee" ||
          destination.hostname === "line.me" ||
          destination.hostname.endsWith(".line.me")
        ) {
          ensureTag()("event", "line_consultation_click", { page_path: path });
        }
      } catch {
        // Ignore malformed links.
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
