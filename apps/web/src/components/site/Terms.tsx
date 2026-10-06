import { TERMS } from "./copy";
import { HomeRail } from "./HomeRail";
import { Prose } from "./Prose";

/** The terms, with the refund policy inside them (copy.ts). */
export function Terms() {
  return (
    <div className="home">
      <HomeRail current="terms" />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Terms & refunds</p>
            <h1 className="home-title">On what terms.</h1>
            <p className="home-sub">
              The short version: prices are estimates until you pay; an unpaid
              order is yours to cancel; a paid one is refunded the way it was
              paid; what you make is yours.
            </p>
          </header>
          <Prose sections={TERMS} />
        </div>
      </section>
    </div>
  );
}
