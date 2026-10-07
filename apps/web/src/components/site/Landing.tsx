"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { dimensionSummary } from "@furnishes/domain";
import { sgd } from "@/components/studio/assets-data";
import { products } from "@/components/studio/catalogue";
import { Portrait } from "@/components/studio/Portrait";
import { useSession } from "@/lib/auth-client";
import { SITE } from "@/lib/site";
import { CookieNote } from "./CookieNote";
import { HELP, LANDING } from "./copy";
import { copyright, SITE_PAGES } from "./pages";
import { Swaps } from "./Swap";
import { SWAPS } from "./swaps";
import { Waitlist } from "./Waitlist";

/**
 * The landing page, where the site opens: the approved design (the
 * red-orange band with the compressed title and its fading echoes, the
 * cream main, bracketed caps labels, a section rail on the left, a
 * full-screen menu, reveals on scroll, the accent footer) around the
 * studio's own content: a spot as it is and with the piece, the
 * pieces with their estimated prices, how a piece is built,
 * what the studio does, and the list for the day ordering opens. The
 * page scrolls inside itself (the body does not scroll), so the rail,
 * the reveals and the bar's shade read this element's scroll.
 */
const SECTIONS = [
  { id: "home", label: "Home", desc: "A spot as it is, and with the piece." },
  { id: "pieces", label: "Pieces", desc: "Every piece, one panel." },
  { id: "how", label: "Built", desc: LANDING.how.head },
  { id: "eva", label: "Studio", desc: LANDING.eva.head },
  { id: "waitlist", label: "Waitlist", desc: "One note when ordering opens." },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

/** the menu's and the footer's pages: the studio first, then the site's */
const PAGES = [
  { href: SITE.studio, label: LANDING.eva.studio },
  ...SITE_PAGES.filter((p) => !p.legal),
];
const LEGAL = SITE_PAGES.filter((p) => p.legal);

const ECHOES = [0.9, 0.65, 0.4, 0.15];
const pieces = products.filter((p) => p.recipe);

/** where a section starts, in the page's own scroll */
const topOf = (root: HTMLElement, id: string) => {
  const el = document.getElementById(id);
  return el
    ? el.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop
    : null;
};

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const band = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState(false);
  const [past, setPast] = useState(false);
  const [active, setActive] = useState<SectionId>("home");
  const [atFoot, setAtFoot] = useState(false);
  const { data: session } = useSession();

  // the bar turns solid once the band has scrolled away; the rail
  // follows the section at the middle of the screen; the footer hides it
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const bandH = band.current?.offsetHeight ?? el.clientHeight * 0.24;
      setPast(el.scrollTop > bandH - 40);
      const line = el.scrollTop + el.clientHeight * 0.5;
      let cur: SectionId = "home";
      for (const s of SECTIONS) {
        const top = topOf(el, s.id);
        if (top !== null && line >= top) cur = s.id;
      }
      setActive(cur);
      const foot = topOf(el, "contact");
      setAtFoot(foot !== null && foot < el.scrollTop + el.clientHeight * 0.7);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // each section's items come in with a small stagger as it arrives
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>(".ld-reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((i) => i.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const seen = new Map<Element | null, number>();
        entries
          .filter((e) => e.isIntersecting)
          .forEach((e) => {
            const it = e.target as HTMLElement;
            io.unobserve(it);
            const group = it.closest("section, footer");
            const step = seen.get(group) ?? 0;
            seen.set(group, step + 1);
            it.style.transitionDelay = `${Math.min(step, 6) * 90}ms`;
            it.classList.add("is-in");
          });
      },
      { root: el, threshold: 0.16, rootMargin: "0px 0px -8% 0px" },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);

  // the menu: Escape closes it, and it keeps the focus while open
  const menuEl = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const first = menuEl.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const goTo = (id: string) => {
    setMenu(false);
    const el = root.current;
    const top = el && topOf(el, id);
    if (!el || top === null) return;
    el.scrollTo({ top: id === "home" ? 0 : top - 8, behavior: "smooth" });
  };
  const railLight = active === "home" && !past;

  return (
    <div className={`ld${menu ? " is-menu" : ""}`} ref={root}>
      <div className={`ld-bar${past ? " is-solid" : ""}`}>
        <button
          type="button"
          className="ld-bar-menu ld-label"
          aria-expanded={menu}
          aria-controls="ld-menu"
          onClick={() => setMenu((v) => !v)}
        >
          {menu ? "Close" : "Menu"}
        </button>
        <button type="button" className="ld-brand" onClick={() => goTo("home")}>
          furnishes.
        </button>
        <Link
          className="ld-bar-cta ld-label"
          href={session ? SITE.studio : "/account"}
        >
          {session ? "Studio" : "Sign in"}
        </Link>
      </div>

      <div
        className={`ld-menu${menu ? " is-open" : ""}`}
        id="ld-menu"
        ref={menuEl}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!menu}
        inert={!menu}
      >
        <div className="ld-menu-grid">
          <div>
            <p className="ld-eye ld-menu-eye">[ Studio ]</p>
            <p className="ld-menu-h">{SITE.name}</p>
            <div className="ld-menu-items">
              {PAGES.map((p) => (
                <Link key={p.href} href={p.href} className="ld-menu-li">
                  {p.label}
                </Link>
              ))}
              {LEGAL.map((p) => (
                <Link key={p.href} href={p.href} className="ld-menu-li">
                  {p.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`ld-menu-nav${active === s.id ? " is-on" : ""}`}
                onClick={() => goTo(s.id)}
              >
                <span className="ld-menu-ix">[0{i + 1}]</span>
                {s.label}
              </button>
            ))}
            <button
              type="button"
              className="ld-menu-nav"
              onClick={() => goTo("contact")}
            >
              <span className="ld-menu-ix">[0{SECTIONS.length + 1}]</span>
              Contact
            </button>
            <p className="ld-eye ld-menu-eye ld-menu-connect">[ Connect ]</p>
            <a className="ld-menu-sub" href={`mailto:${SITE.contact}`}>
              {SITE.contact}
            </a>
          </div>
        </div>
      </div>

      <nav
        className={`ld-rail${railLight ? " is-light" : ""}${atFoot ? " is-hidden" : ""}`}
        aria-label="Section"
      >
        {SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <div key={s.id}>
              <button
                type="button"
                className="ld-rail-btn"
                aria-current={on ? "location" : undefined}
                onClick={() => goTo(s.id)}
              >
                {on && <span aria-hidden="true">[</span>}
                <span>{s.label}</span>
                {on && <span aria-hidden="true">]</span>}
              </button>
              {on && <p className="ld-rail-desc">{s.desc}</p>}
            </div>
          );
        })}
      </nav>

      <main>
        <div className="ld-stage" id="home">
          <header className="ld-band" ref={band}>
            <div className="ld-lockup">
              <h1
                className="ld-title"
                aria-label={`${LANDING.title.big} ${LANDING.title.echo}`}
              >
                <span className="ld-title-big">{LANDING.title.big}</span>
                {ECHOES.map((o, i) => (
                  <span
                    key={o}
                    className="ld-title-echo"
                    style={{ opacity: o }}
                    aria-hidden={i > 0}
                  >
                    {LANDING.title.echo}
                  </span>
                ))}
              </h1>
              <p className="ld-label ld-blurb">
                {LANDING.blurb[0]}
                <br />
                {LANDING.blurb[1]}
              </p>
            </div>
          </header>
          <div className="ld-main">
            <Swaps swaps={SWAPS} />
            <Link className="ld-tag" href={SITE.studio}>
              <span className="ld-tagline">{LANDING.tag}</span>
              <span className="ld-mark-bk" aria-hidden="true">
                [<span className="ld-mark-arrow">↗</span>]
              </span>
            </Link>
          </div>
        </div>

        <div className="ld-below">
          <section className="ld-block" id="pieces">
            <p className="ld-eye ld-reveal">[ Pieces ]</p>
            <h2 className="ld-h2 ld-reveal">
              {LANDING.pieces.head(pieces.length)}
            </h2>
            <p className="ld-lede ld-reveal">{LANDING.pieces.lede}</p>
            <ul className="ld-pieces">
              {pieces.map((p) => (
                <li key={p.id} className="ld-piece ld-reveal">
                  <Link
                    href={`${SITE.studio}?piece=${p.id}`}
                    className="ld-piece-link"
                    aria-label={`${p.name}: ${LANDING.pieces.open}`}
                  >
                    <Portrait productId={p.id} className="ld-piece-pic" />
                    <span className="ld-piece-name">{p.name}</span>
                    <span className="ld-piece-size">
                      {dimensionSummary(p.recipe!)}
                    </span>
                    <span className="ld-piece-price">
                      {sgd(p.price)} <small>estimate</small>
                    </span>
                    <span className="ld-piece-open">
                      {LANDING.pieces.open}
                      <span aria-hidden="true"> →</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="ld-block" id="how">
            <p className="ld-eye ld-reveal">[ How it is built ]</p>
            <h2 className="ld-h2 ld-reveal">{LANDING.how.head}</h2>
            <div className="ld-how">
              {HELP.slice(0, 3).map((s) => (
                <div key={s.id} className="ld-reveal">
                  <h3 className="ld-h3">{s.head}</h3>
                  <p className="ld-p">{s.body[0]}</p>
                </div>
              ))}
            </div>
            <Link className="ld-quiet ld-reveal" href="/help">
              {LANDING.how.more}
              <span aria-hidden="true"> →</span>
            </Link>
          </section>

          <section className="ld-block" id="eva">
            <p className="ld-eye ld-reveal">[ The studio ]</p>
            <h2 className="ld-h2 ld-reveal">{LANDING.eva.head}</h2>
            <p className="ld-lede ld-reveal">{LANDING.eva.lede}</p>
            <div className="ld-acts ld-reveal">
              <Link className="ld-btn" href={SITE.studio}>
                {LANDING.eva.studio}
                <span aria-hidden="true"> →</span>
              </Link>
              {!session && (
                <Link className="ld-quiet" href="/account">
                  {LANDING.eva.account}
                  <span aria-hidden="true"> →</span>
                </Link>
              )}
            </div>
          </section>

          <Waitlist />
        </div>
      </main>

      <footer className="ld-foot" id="contact">
        <Link className="ld-foot-cta" href="/help#ask">
          <span>{LANDING.foot.cta[0]}</span>
          <span className="ld-foot-cta-b">{LANDING.foot.cta[1]}</span>
        </Link>
        <div className="ld-foot-grid">
          <div className="ld-foot-brand">
            <p className="ld-foot-mark">furnishes.</p>
            <p className="ld-foot-p">{LANDING.foot.blurb}</p>
          </div>
          <div>
            <h3 className="ld-foot-h">[ Contact ]</h3>
            <p className="ld-foot-p">
              <a className="ld-foot-link" href={`mailto:${SITE.contact}`}>
                {SITE.contact}
              </a>
            </p>
          </div>
          <div>
            <h3 className="ld-foot-h">[ Pages ]</h3>
            <ul className="ld-foot-list">
              {PAGES.map((p) => (
                <li key={p.href}>
                  <Link className="ld-foot-link" href={p.href}>
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="ld-foot-h">[ Legal ]</h3>
            <ul className="ld-foot-list">
              {LEGAL.map((p) => (
                <li key={p.href}>
                  <Link className="ld-foot-link" href={p.href}>
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="ld-foot-copy">{copyright()}</p>
      </footer>

      <CookieNote past={past} />
    </div>
  );
}
