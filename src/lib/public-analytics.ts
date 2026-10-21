export const GA4_MEASUREMENT_ID = "G-TZK3912PSM";
export const ANALYTICS_OPT_OUT_KEY = "yoshida_public_analytics_opt_out";

// Exact paths only. Case details, B2B cases and every customer/app route are excluded.
export const PUBLIC_ANALYTICS_TITLES: Readonly<Record<string, string>> = {
  "/": "時計修理・オーバーホール",
  "/about-technician": "時計修理技能士について",
  "/cases/gallery": "修理事例ギャラリー",
  "/commercial-disclosure": "特定商取引法に基づく表記",
  "/difficult-repair": "難しい時計修理",
  "/line-consultation": "LINEで相談",
  "/packing-guide": "梱包ガイド",
  "/parts-sourcing": "部品調達",
  "/price-quality": "料金と品質",
  "/reassurance": "安心の修理",
  "/repair-flow": "修理の流れ",
  "/waterproof-check": "防水検査",
};

export function publicAnalyticsPayload(pathname: string, origin: string, search: string, hash: string) {
  if (search || hash) return null;
  const pageTitle = PUBLIC_ANALYTICS_TITLES[pathname];
  if (!pageTitle || !/^https?:\/\/[^/?#]+$/.test(origin)) return null;
  return {
    page_location: origin + pathname,
    page_path: pathname,
    page_title: pageTitle,
    page_referrer: "",
  };
}

export function isLineConsultationHref(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" &&
      (url.hostname === "lin.ee" || url.hostname === "line.me" || url.hostname.endsWith(".line.me"));
  } catch {
    return false;
  }
}
