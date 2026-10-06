import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** crawlers: the pages, never the API nor the page a reset link opens */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/reset"] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
