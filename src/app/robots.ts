import type { MetadataRoute } from "next";

const siteUrl = "https://yoshidawatchrepair.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/parts-sourcing"],
      disallow: [
        "/api",
        "/admin",
        "/dev",
        "/inquiries",
        "/invoices",
        "/masters",
        "/orders",
        "/parts",
        "/public-cases",
        "/repairs",
        "/customers",
        "/line-users",
        "/reports",
        "/customer",
        "/documents",
        "/mobile",
        "/pdf-preview",
        "/login",
        "/board",
        "/cases/biz",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
