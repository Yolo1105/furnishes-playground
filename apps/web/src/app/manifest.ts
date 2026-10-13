import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** the studio as a phone or a desktop installs it: its name, its one
    page, its icon and the cream it opens on */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: "Furnishes",
    description: SITE.description,
    start_url: SITE.studio,
    display: "standalone",
    background_color: "#fff2e5",
    theme_color: "#fff2e5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
