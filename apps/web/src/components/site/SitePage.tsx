import type { ReactNode } from "react";
import { HomeRail, type RailPage } from "./HomeRail";

/**
 * An inner page's shell: the rail, and a stage with the page's head (a
 * caps eyebrow, a title, a line under it) above whatever the page is.
 * Help, privacy, the terms, the account's reset, operations, a page
 * that failed and a page that is not here all stand in it.
 */
export function SitePage({
  current,
  eye,
  title,
  sub,
  children,
}: {
  current: RailPage | null;
  eye: string;
  title: ReactNode;
  sub: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="home">
      <HomeRail current={current} />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">{eye}</p>
            <h1 className="home-title">{title}</h1>
            <p className="home-sub">{sub}</p>
          </header>
          {children}
        </div>
      </section>
    </div>
  );
}
