import Link from "next/link";
import { SitePage } from "@/components/site/SitePage";
import { SITE } from "@/lib/site";

/** A page that is not here, said in the site's language. */
export default function NotFound() {
  return (
    <SitePage
      current={null}
      eye="Not found"
      title="There is no page here."
      sub="The address may have changed, or never was. The studio and the pages are a step away."
    >
      <div className="home-acts home-acts-pad">
        <Link className="home-btn home-btn-primary" href="/">
          Home
          <span aria-hidden="true"> →</span>
        </Link>
        <Link className="home-btn" href={SITE.studio}>
          Into the studio
        </Link>
      </div>
    </SitePage>
  );
}
