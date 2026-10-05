import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * The rail of the home pages (the way in, the privacy page, a page that
 * failed): the brand, the Workspace switch with its indices, and the
 * footer with the tagline, the year and the privacy link.
 */
export function HomeRail({
  current,
  studio = "/rounded",
}: {
  /** which entry is this page */
  current: "account" | "privacy" | null;
  studio?: string;
}) {
  const entry = (
    id: "account" | "privacy",
    href: string,
    label: string,
    ix: string,
  ) =>
    current === id ? (
      <span className="home-mode" aria-current="page">
        <span>{label}</span>
        <span className="home-ix">{ix}</span>
      </span>
    ) : (
      <Link className="home-mode" href={href}>
        <span>{label}</span>
        <span className="home-ix">{ix}</span>
      </Link>
    );
  return (
    <aside className="home-rail" aria-label="Account">
      <div className="home-brand">
        FURNISHES <b>「</b>STUDIO<b>」</b>
      </div>
      <div className="home-scroll">
        <div className="home-group">
          <p className="home-group-h">Workspace</p>
          <nav className="home-modes" aria-label="Workspace">
            <Link className="home-mode" href={studio}>
              <span>Studio</span>
              <span className="home-ix">[01]</span>
            </Link>
            {entry("account", "/", "Account", "[02]")}
            {entry("privacy", "/privacy", "Privacy & terms", "[03]")}
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
