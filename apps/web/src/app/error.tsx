"use client";

import Link from "next/link";
import { HomeRail } from "@/components/studio/HomeRail";

/**
 * A page that failed: said plainly in the home page's language, with a
 * way to try again and a way into the studio. The browser's copy of the
 * work is untouched by a failure here.
 */
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="home">
      <HomeRail current={null} />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Something went wrong</p>
            <h1 className="home-title">This page did not load.</h1>
            <p className="home-sub">
              Your work in this browser is as it was. Try the page again, or go
              on into the studio.
            </p>
          </header>
          <div className="home-acts home-acts-pad">
            <button
              type="button"
              className="home-btn home-btn-primary"
              onClick={reset}
            >
              Try again
            </button>
            <Link className="home-quiet" href="/rounded">
              Open the studio →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
