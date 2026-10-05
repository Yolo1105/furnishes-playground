import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** the pages worth finding: the way in, the two studios, the privacy page */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/rounded", "/studio", "/privacy"].map((path) => ({
    url: `${SITE.url}${path}`,
  }));
}
