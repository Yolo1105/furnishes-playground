import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** the pages worth finding: the landing, the two studios, the account's
    way in, help, privacy and the terms */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/rounded",
    "/studio",
    "/account",
    "/help",
    "/privacy",
    "/terms",
  ].map((path) => ({
    url: `${SITE.url}${path}`,
  }));
}
