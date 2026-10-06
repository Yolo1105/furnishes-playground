import { AskForm } from "./AskForm";
import { HELP } from "./copy";
import { HomeRail } from "./HomeRail";
import { Prose } from "./Prose";

/** How it works, and how to reach the studio: the help sections
    (copy.ts), and under the last one the form that asks us. */
export function Help() {
  return (
    <div className="home">
      <HomeRail current="help" />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Help</p>
            <h1 className="home-title">How it works, and how to reach us.</h1>
            <p className="home-sub">
              One panel system, built by you with one key. What arrives, what
              can go back, where a price comes from, and a form for the spot
              that bothers you.
            </p>
          </header>
          <Prose sections={HELP} />
          <AskForm />
        </div>
      </section>
    </div>
  );
}
