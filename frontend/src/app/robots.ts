import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/advisor", "/architect", "/catalog", "/estimator", "/pricing"],
        disallow: ["/api/", "/estimates", "/login", "/recommendations/", "/workspace"]
      }
    ],
    sitemap: `${getSiteUrl()}/sitemap.xml`,
    host: getSiteUrl()
  };
}
