import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** crawlers: the pages, never the API, the page a reset link opens,
    the studio's operations nor the rooms people share by link */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/reset", "/ops", "/s/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
