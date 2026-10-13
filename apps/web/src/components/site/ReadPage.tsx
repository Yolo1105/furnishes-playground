import Link from "next/link";
import { SitePage } from "./SitePage";
import { HELP, PRIVACY, TERMS, type Section } from "./copy";
import { READINGS, readingUrl, SITE, type Reading } from "@/lib/site";

const PAGES: Record<
  Reading,
  { name: string; title: string; sub: string; sections: Section[] }
> = {
  help: {
    name: "Help",
    title: "How it works.",
    sub: "One panel system, built by you with one key. What arrives, what can go back, and where a price comes from.",
    sections: HELP,
  },
  terms: {
    name: "Terms & refunds",
    title: "On what terms.",
    sub: "The short version: prices are estimates until you pay; an unpaid order is yours to cancel; a paid one is refunded the way it was paid; what you make is yours.",
    sections: TERMS,
  },
  privacy: {
    name: "Privacy",
    title: "What the studio keeps.",
    sub: "The short version: your work lives in your browser; an account mirrors it so it follows you; nothing is sold or tracked.",
    sections: PRIVACY,
  },
};

/**
 * One of the studio's readings (help, terms, privacy) at the studio's
 * own address, ?read=: the sections of copy.ts in the inner page's
 * shell, a caps heading and its paragraphs, each reachable by its id;
 * then the way to the other two and back to the studio.
 */
export function ReadPage({ reading }: { reading: Reading }) {
  const page = PAGES[reading];
  return (
    <SitePage eye={page.name} title={page.title} sub={page.sub}>
      <div className="home-prose" data-reading={reading}>
        {page.sections.map((s) => (
          <section key={s.id} id={s.id}>
            <h2 className="home-eye">{s.head}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="home-sub">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <nav
        className="shell-dialog-acts home-acts-pad"
        aria-label="More to read"
      >
        {READINGS.filter((r) => r !== reading).map((r) => (
          <Link key={r} href={readingUrl(r)} className="main-btn">
            {PAGES[r].name}
          </Link>
        ))}
        <Link href={SITE.studio} className="main-btn main-btn-primary">
          Open the studio
        </Link>
      </nav>
    </SitePage>
  );
}
