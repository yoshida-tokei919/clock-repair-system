"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  ANALYTICS_OPT_OUT_KEY,
  GA4_MEASUREMENT_ID,
  isLineConsultationHref,
  publicAnalyticsPayload,
} from "@/lib/public-analytics";

type Gtag = (...args: unknown[]) => void;
type AnalyticsWindow = Window & { dataLayer?: IArguments[]; gtag?: Gtag };

function disableLoadedTag() {
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA4_MEASUREMENT_ID}`] = true;
}

function optedOut(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("analytics_opt_out") === "1") {
      localStorage.setItem(ANALYTICS_OPT_OUT_KEY, "1");
      url.searchParams.delete("analytics_opt_out");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === "1";
  } catch {
    // Tracking stays off if browser storage is unavailable.
    return true;
  }
}

function tag(payload: NonNullable<ReturnType<typeof publicAnalyticsPayload>>): Gtag {
  const browser = window as AnalyticsWindow;
  if (!browser.gtag) {
    browser.dataLayer = [];
    browser.gtag = function () { browser.dataLayer?.push(arguments); };
    browser.gtag("js", new Date());
    browser.gtag("set", payload);
    browser.gtag("config", GA4_MEASUREMENT_ID, {
      ...payload,
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    const script = document.createElement("script");
    script.async = true;
    script.referrerPolicy = "no-referrer";
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  } else {
    browser.gtag("set", payload);
  }
  return browser.gtag;
}

export function PublicAnalytics() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const isOptedOut = optedOut();
    const payload = publicAnalyticsPayload(pathname, window.location.origin, window.location.search, window.location.hash);
    if (isOptedOut || !payload || lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;
    tag(payload)("event", "page_view", payload);
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const payload = publicAnalyticsPayload(
        window.location.pathname, window.location.origin, window.location.search, window.location.hash,
      );
      if (!payload || optedOut() || !isLineConsultationHref(anchor.href)) return;
      tag(payload)("event", "line_consultation_click", payload);
    }
    function onStorage(event: StorageEvent) {
      if (event.key === ANALYTICS_OPT_OUT_KEY && event.newValue === "1") {
        disableLoadedTag();
        window.location.reload();
      }
    }
    // Prevent GA4's enhanced history listener from ever observing a changed URL.
    // A new document loads its own allowlist check before the Google tag can run.
    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    function guardHistory(original: History["pushState"], replace: boolean): History["pushState"] {
      return function (this: History, data, unused, url) {
        if (url != null) {
          try {
            const next = new URL(String(url), window.location.href);
            if (next.origin === window.location.origin && next.href !== window.location.href) {
              disableLoadedTag();
              if (replace) window.location.replace(next.href);
              else window.location.assign(next.href);
              return;
            }
          } catch {
            // Preserve native History API errors for malformed URLs.
          }
        }
        return original.call(this, data, unused, url);
      };
    }
    window.history.pushState = guardHistory(originalPushState, false);
    window.history.replaceState = guardHistory(originalReplaceState, true);

    // Capture history traversals before any Google listeners can inspect the URL.
    function onHistoryNavigation() {
      disableLoadedTag();
      window.location.reload();
    }
    // Public navigation uses a document load, so GA enhanced history measurement
    // cannot add a second page_view or capture gallery search parameters.
    function onPublicNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.hash) {
        event.preventDefault();
        document.getElementById(decodeURIComponent(destination.hash.slice(1)))?.scrollIntoView();
        return;
      }
      event.preventDefault();
      window.location.assign(destination.href);
    }
    document.addEventListener("click", onPublicNavigation, true);
    document.addEventListener("click", onClick);
    window.addEventListener("storage", onStorage);
    window.addEventListener("popstate", onHistoryNavigation, true);
    window.addEventListener("hashchange", onHistoryNavigation, true);
    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      document.removeEventListener("click", onPublicNavigation, true);
      document.removeEventListener("click", onClick);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("popstate", onHistoryNavigation, true);
      window.removeEventListener("hashchange", onHistoryNavigation, true);
    };
  }, []);

  return null;
}
