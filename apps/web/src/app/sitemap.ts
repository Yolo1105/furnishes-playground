import type { MetadataRoute } from "next";
import { READINGS, readingUrl, SITE } from "@/lib/site";

/** the one page there is, the studio, and the readings it opens */
export default function sitemap(): MetadataRoute.Sitemap {
  return [SITE.studio, ...READINGS.map(readingUrl)].map((path) => ({
    url: `${SITE.url}${path}`,
  }));
}
