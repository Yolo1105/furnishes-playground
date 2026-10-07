import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** crawlers: the pages, never the API, the page a reset link opens nor
    the studio's operations */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/reset", "/ops"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
