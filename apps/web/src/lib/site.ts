/**
 * The site, in one place: its name, its address, where to write to it.
 * Everything that names the site (the page titles, the sitemap, the
 * auth's trusted origins, the privacy page, the feedback link) reads
 * this. A deployment under another name or address sets the public
 * variables below (baked in at build time, so a change is a rebuild);
 * without them this is furnish-es.com.
 */
const text = (name: string, fallback: string) =>
  process.env[name]?.trim() || fallback;

export const SITE = {
  name: text("NEXT_PUBLIC_SITE_NAME", "Furnishes Studio"),
  url: text("NEXT_PUBLIC_SITE_URL", "https://furnish-es.com").replace(
    /\/+$/,
    "",
  ),
  contact: text("NEXT_PUBLIC_SITE_CONTACT", "hello@furnish-es.com"),
  description: "Design-to-buy studio for modular panel furniture.",
};

/** the site's origins a sign-in may come from: its own address, with
    and without www, and Vercel's preview addresses */
export const trustedOrigins = () => {
  const host = new URL(SITE.url).host;
  return [SITE.url, `https://www.${host}`, "https://*.vercel.app"];
};
