/**
 * The site, in one place: its name, its address, where to write to it.
 * Everything that names the site (the page titles, the sitemap, the
 * auth's trusted origins, the privacy page, the feedback link) reads
 * this; a deployment elsewhere changes it here.
 */
export const SITE = {
  name: "Furnishes Studio",
  url: "https://furnish-es.com",
  contact: "hello@furnish-es.com",
  description: "Design-to-buy studio for modular panel furniture.",
} as const;

/** the site's origins a sign-in may come from: its own address, with
    and without www, and Vercel's preview addresses */
export const trustedOrigins = () => {
  const host = new URL(SITE.url).host;
  return [SITE.url, `https://www.${host}`, "https://*.vercel.app"];
};
