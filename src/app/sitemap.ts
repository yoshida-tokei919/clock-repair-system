import type { MetadataRoute } from "next";
import { getB2CPublicCaseSitemapEntries } from "@/lib/public-cases";

export const dynamic = "force-dynamic";

const siteUrl = "https://yoshidawatchrepair.com";

const staticPaths = [
  "/",
  "/about-technician",
  "/cases/gallery",
  "/commercial-disclosure",
  "/difficult-repair",
  "/line-consultation",
  "/packing-guide",
  "/parts-sourcing",
  "/price-quality",
  "/repair-flow",
  "/waterproof-check",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const publicCases = await getB2CPublicCaseSitemapEntries();

  return [
    ...staticPaths.map((path) => ({ url: `${siteUrl}${path}` })),
    ...publicCases.map(({ id, updatedAt }) => ({
      url: `${siteUrl}/cases/gallery/${id}`,
      lastModified: updatedAt,
    })),
  ];
}
