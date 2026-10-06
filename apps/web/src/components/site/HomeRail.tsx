import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * The rail of the inner pages (the account's way in, help, privacy,
 * terms, a page that failed): the brand, which goes home, the pages
 * with their indices, and the footer with the tagline and the year.
 */
const PAGES = [
  ["account", "/account", "Account"],
  ["help", "/help", "Help"],
  ["privacy", "/privacy", "Privacy"],
  ["terms", "/terms", "Terms & refunds"],
] as const;
export type RailPage = (typeof PAGES)[number][0];
export function HomeRail({
  current,
  studio = "/rounded",
}: {
  /** which entry is this page */
  current: RailPage | null;
  studio?: string;
}) {
  const entry = (id: RailPage, href: string, label: string, ix: string) =>
    current === id ? (
      <span key={id} className="home-mode" aria-current="page">
        <span>{label}</span>
        <span className="home-ix">{ix}</span>
      </span>
    ) : (
      <Link key={id} className="home-mode" href={href}>
        <span>{label}</span>
        <span className="home-ix">{ix}</span>
      </Link>
    );
  return (
    <aside className="home-rail" aria-label="Pages">
      <Link className="home-brand" href="/">
        FURNISHES <b>「</b>STUDIO<b>」</b>
      </Link>
      <div className="home-scroll">
        <div className="home-group">
          <p className="home-group-h">Workspace</p>
          <nav className="home-modes" aria-label="Pages">
            <Link className="home-mode" href={studio}>
              <span>Studio</span>
              <span className="home-ix">[01]</span>
            </Link>
            {PAGES.map(([id, href, label], i) =>
              entry(id, href, label, `[0${i + 2}]`),
            )}
          </nav>
        </div>
      </div>
      <div className="home-foot">
        <span className="home-rule" aria-hidden="true" />
        <h2 className="home-tagline">
          A design studio where rooms move off-template
        </h2>
        <p className="home-credit">
          © {new Date().getFullYear()}, {SITE.name}
        </p>
      </div>
    </aside>
  );
}
