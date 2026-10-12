import Link from "next/link";
import { SITE } from "@/lib/site";
import { copyright } from "./pages";

/**
 * The rail beside what a link opens outside the studio (an order, a new
 * password): the brand and the way back into the studio, and the
 * footer with the tagline and the year.
 */
export function HomeRail() {
  return (
    <aside className="home-rail" aria-label="Pages">
      <Link className="home-brand" href={SITE.studio}>
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
