"use client";

import Link from "next/link";
import { SitePage } from "@/components/site/SitePage";
import { SITE } from "@/lib/site";

/**
 * A page that failed: said plainly in the site's language, with a way
 * to try again and a way into the studio. The browser's copy of the
 * work is untouched by a failure here.
 */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <SitePage
      current={null}
      eye="Something went wrong"
      title="This page did not load."
      sub="Your work in this browser is as it was. Try the page again, or go on into the studio."
    >
      <div className="home-acts home-acts-pad">
        <button
          type="button"
          className="home-btn home-btn-primary"
          onClick={reset}
        >
          Try again
          <span aria-hidden="true"> →</span>
        </button>
        <Link className="home-btn" href={SITE.studio}>
          Open the studio
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </SitePage>
  );
}
