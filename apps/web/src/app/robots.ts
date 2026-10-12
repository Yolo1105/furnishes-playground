import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** crawlers: the studio, never the API */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
