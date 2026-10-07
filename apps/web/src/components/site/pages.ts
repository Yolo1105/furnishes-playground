import { SITE } from "@/lib/site";

/**
 * The site's pages, in one list: the rail of the inner pages, the
 * landing's menu and footer and the sitemap all read it, so a page
 * added here is everywhere at once. The studio's own two addresses
 * stand apart (SITE.studio and the square one).
 */
export const SITE_PAGES = [
  { id: "account", href: "/account", label: "Account", legal: false },
  { id: "help", href: "/help", label: "Help", legal: false },
  { id: "privacy", href: "/privacy", label: "Privacy", legal: true },
  { id: "terms", href: "/terms", label: "Terms & refunds", legal: true },
] as const;
export type PageId = (typeof SITE_PAGES)[number]["id"];

export const pageLabel = (id: PageId) =>
  SITE_PAGES.find((p) => p.id === id)!.label;

/** every address worth finding, for the sitemap */
export const SITEMAP_PATHS = [
  "/",
  SITE.studio,
  "/studio",
  ...SITE_PAGES.map((p) => p.href),
];

/** the footer's line */
export const copyright = () => `© ${new Date().getFullYear()} ${SITE.name}`;
