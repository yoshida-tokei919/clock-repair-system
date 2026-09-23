import "server-only";
import type { Metadata } from "next";

export const SITE_URL = "https://yoshidawatchrepair.com";

type FixedPageSeo = {
  metadata: Metadata;
  breadcrumb: string;
};

export const fixedPageSeo = {
  "/about-technician": {
    metadata: {
      title: "1級時計修理技能士・修理歴20年｜技術者紹介｜ヨシダ時計修理工房",
      description: "時計学校卒業後、国内時計メーカーの修理現場で経験を積んだ1級時計修理技能士が担当。修理歴20年の経験をもとに、時計の状態に応じた修理方法を判断します。",
      alternates: { canonical: "/about-technician" },
    },
    breadcrumb: "技術者紹介",
  },
  "/cases/gallery": {
    metadata: {
      title: "時計修理・オーバーホールの修理事例｜ヨシダ時計修理工房",
      description: "ロレックス、オメガなど腕時計の修理・オーバーホール事例を掲載。ブランド、モデル、Ref、Cal、修理内容から実際の対応例をご確認いただけます。",
      alternates: { canonical: "/cases/gallery" },
    },
    breadcrumb: "修理事例",
  },
  "/commercial-disclosure": {
    metadata: {
      title: "特定商取引法に基づく表記｜ヨシダ時計修理工房",
      description: "ヨシダ時計修理工房の事業者情報、修理料金以外に必要な費用、支払方法、キャンセル、保証など、特定商取引法に基づく表記をご案内します。",
      alternates: { canonical: "/commercial-disclosure" },
    },
    breadcrumb: "特定商取引法に基づく表記",
  },
  "/difficult-repair": {
    metadata: {
      title: "他店で断られた時計修理・部品供給終了も相談｜ヨシダ時計修理工房",
      description: "他店で修理不可、メーカーで部品供給終了と言われた時計もご相談ください。部品調達・加工・製作・適合部品などを含め、修理の可能性を検討します。",
      alternates: { canonical: "/difficult-repair" },
    },
    breadcrumb: "他店で断られた時計の修理",
  },
  "/line-consultation": {
    metadata: {
      title: "LINEで時計修理の概算相談｜ヨシダ時計修理工房",
      description: "時計を送る前に、写真や症状、型番など分かる範囲の情報から、必要になりそうな修理内容と費用感の目安をLINEでご案内します。",
      alternates: { canonical: "/line-consultation" },
    },
    breadcrumb: "LINEで概算相談",
  },
  "/packing-guide": {
    metadata: {
      title: "時計修理の郵送・梱包方法｜ヨシダ時計修理工房",
      description: "腕時計を修理で郵送する際の安全な梱包方法をご案内。お手元の箱や緩衝材を使い、時計が箱の中で動かないよう保護するポイントを解説します。",
      alternates: { canonical: "/packing-guide" },
    },
    breadcrumb: "時計郵送時の梱包方法",
  },
  "/parts-sourcing": {
    metadata: {
      title: "時計部品の調達・加工・製作｜ヨシダ時計修理工房",
      description: "メーカー供給終了や入手困難な時計部品も、国内外の材料店や修理ネットワークから調査。純正部品、適合部品、加工・製作を含めて対応方法を検討します。",
      alternates: { canonical: "/parts-sourcing" },
    },
    breadcrumb: "時計部品の調達",
  },
  "/price-quality": {
    metadata: {
      title: "時計修理・オーバーホール料金｜ヨシダ時計修理工房",
      description: "ロレックス、オメガなど腕時計のオーバーホール基本料金をご案内。時計の状態を確認し、必要な作業と費用・仕上がりのバランスを考えてお見積りします。",
      alternates: { canonical: "/price-quality" },
    },
    breadcrumb: "修理料金",
  },
  "/repair-flow": {
    metadata: {
      title: "時計修理の流れ｜LINE相談・見積り・郵送・保証｜ヨシダ時計修理工房",
      description: "LINEでの事前相談から概算、郵送、受付、正式見積り、修理、納品・保証まで、時計修理をご依頼いただく流れと注意点をご案内します。",
      alternates: { canonical: "/repair-flow" },
    },
    breadcrumb: "時計修理の流れ",
  },
  "/waterproof-check": {
    metadata: {
      title: "時計修理後の防水検査・パッキン確認｜ヨシダ時計修理工房",
      description: "オーバーホール後の防水検査と、裏蓋・リューズ・プッシャー・ガラス周りのパッキン確認についてご案内。時計の状態に合わせて防水性を確認します。",
      alternates: { canonical: "/waterproof-check" },
    },
    breadcrumb: "防水検査・パッキン確認",
  },
} satisfies Record<string, FixedPageSeo>;

export type FixedPagePath = keyof typeof fixedPageSeo;
export const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "ヨシダ時計修理工房",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/img/logo.png`,
      address: {
        "@type": "PostalAddress",
        addressLocality: "神戸市",
        addressRegion: "兵庫県",
        addressCountry: "JP",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "ヨシダ時計修理工房",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export function breadcrumbJsonLd(path: FixedPagePath) {
  const page = fixedPageSeo[path];

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: page.breadcrumb, item: `${SITE_URL}${path}` },
    ],
  };
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
