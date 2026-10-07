import Link from "next/link";
import { HomeRail } from "@/components/site/HomeRail";

/** A page that is not here, said in the home page's language. */
export default function NotFound() {
  return (
    <div className="home">
      <HomeRail current={null} />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Not found</p>
            <h1 className="home-title">There is no page here.</h1>
            <p className="home-sub">
              The address may have changed, or never was. The studio and the
              pages are a step away.
            </p>
          </header>
          <div className="home-acts home-acts-pad">
            <Link className="home-btn home-btn-primary" href="/">
              Home
              <span aria-hidden="true"> →</span>
            </Link>
            <Link className="home-btn" href="/rounded">
              Into the studio
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
