import type { MetadataRoute } from "next";
import { SITEMAP_PATHS } from "@/components/site/pages";
import { SITE } from "@/lib/site";

/** the pages worth finding: the landing, the two studios, and the
    site's pages (components/site/pages) */
export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({ url: `${SITE.url}${path}` }));
}
