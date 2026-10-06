import { PRIVACY } from "./copy";
import { HomeRail } from "./HomeRail";
import { Prose } from "./Prose";

/** What the studio keeps and on what terms, said plainly (copy.ts). */
export function Privacy() {
  return (
    <div className="home">
      <HomeRail current="privacy" />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Privacy</p>
            <h1 className="home-title">What the studio keeps.</h1>
            <p className="home-sub">
              The short version: your work lives in your browser; an account
              mirrors it so it follows you; nothing is sold or tracked.
            </p>
          </header>
          <Prose sections={PRIVACY} />
        </div>
      </section>
    </div>
  );
}
