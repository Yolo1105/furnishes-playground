import Link from "next/link";
import { SITE } from "@/lib/site";
import { copyright, SITE_PAGES, type PageId } from "./pages";

/**
 * The rail of the inner pages: the brand, which goes home, the studio
 * and the pages with their indices, and the footer with the tagline
 * and the year. The operations page is an admin's alone, so it shows
 * only while it is the page.
 */
export type RailPage = PageId | "ops";

export function HomeRail({ current }: { current: RailPage | null }) {
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
          <nav className="home-modes" aria-label="Site">
            <Link className="home-mode" href={SITE.studio}>
              <span>Studio</span>
              <span className="home-ix">[01]</span>
            </Link>
            {SITE_PAGES.map((p, i) =>
              entry(p.id, p.href, p.label, `[0${i + 2}]`),
            )}
            {current === "ops" &&
              entry("ops", "/ops", "Operations", `[0${SITE_PAGES.length + 2}]`)}
          </nav>
        </div>
      </div>
      <div className="home-foot">
        <span className="home-rule" aria-hidden="true" />
        <h2 className="home-tagline">
          A design studio where rooms move off-template
        </h2>
        <p className="home-credit">{copyright()}</p>
      </div>
    </aside>
  );
}
