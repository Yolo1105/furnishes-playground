import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** the one page there is: the studio */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE.url}${SITE.studio}` }];
}
