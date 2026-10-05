import { HomeRail } from "./HomeRail";
import { SITE } from "@/lib/site";

/**
 * What the studio keeps and on what terms, said plainly: with and
 * without an account, the one cookie, the services behind it and what
 * each sees, shared rooms, deleting, and the terms of a studio that is
 * still being built.
 */
const SECTIONS: { head: string; body: string[] }[] = [
  {
    head: "Without an account",
    body: [
      "The studio works in your browser. Your projects, the rooms in them, your orders and the room items you make are kept in this browser's own storage and nowhere else. Nothing about you is sent anywhere until you ask something of a service below.",
    ],
  },
  {
    head: "With an account",
    body: [
      "An account holds your name, your email address, a hash of your password (never the password itself) and the sessions you have open. Signed in, the studio mirrors your projects, orders, room items and what the guide has shown you to the account, so they are there on every device you sign in on. The browser stays the truth; the account is its mirror.",
      "You can change your name and end the account from the studio's gear, under Account. Ending it deletes everything the account holds, including any rooms you shared by link. What is in your browser stays there.",
    ],
  },
  {
    head: "Cookies",
    body: [
      "One cookie, the session, which says who is signed in. There is no analytics cookie and no advertising.",
    ],
  },
  {
    head: "The services behind the studio",
    body: [
      "The site runs on Vercel and its database is Neon Postgres; both see the traffic they serve. When Eva is backed by a model, what you write to her and the room she is asked about go to Anthropic for that answer. When room items are drawn and modelled, the few words describing the item go to fal.ai. When payment is wired in, the order and the delivery address go to Stripe. Each receives only what that request needs, and only when you make it.",
    ],
  },
  {
    head: "Shared rooms",
    body: [
      "Share a link makes a copy of the open room, without Eva's side, under a short address. Anyone with the link can see that copy and take it into a studio of their own. Stop sharing, under Account, takes the link down.",
    ],
  },
  {
    head: "Terms",
    body: [
      "The studio is being built and is offered as it is: pieces, prices and delivery are placeholders until the catalogue and checkout are wired to real suppliers, and the service may change or pause without notice. Keep your own copy of anything you cannot lose, which Export gives you.",
      `Questions, requests about your data, or anything that went wrong: ${SITE.contact}.`,
    ],
  },
];

export function Privacy() {
  return (
    <div className="home">
      <HomeRail current="privacy" />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Privacy & terms</p>
            <h1 className="home-title">What the studio keeps.</h1>
            <p className="home-sub">
              The short version: your work lives in your browser; an account
              mirrors it so it follows you; nothing is sold or tracked.
            </p>
          </header>
          <div className="home-prose">
            {SECTIONS.map((s) => (
              <section key={s.head}>
                <h2 className="home-eye">{s.head}</h2>
                {s.body.map((p, i) => (
                  <p key={i} className="home-sub">
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
