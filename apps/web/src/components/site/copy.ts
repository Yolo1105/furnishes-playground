import { SITE } from "@/lib/site";

/**
 * The site's words, in one place: the three readings the studio opens
 * at ?read= (how it works, the terms, the privacy note) and the words
 * every form shares.
 * Every fact here is one the studio can keep: the panel, the unit and
 * the bases are the catalogue's; the prices are said to be estimates
 * because they are; delivery areas, lead times and hours are not stated,
 * because none are settled yet. A section is a heading and its
 * paragraphs; a page lays them out in its own design.
 */
export type Section = { id: string; head: string; body: string[] };

/** how it works: the pieces, delivery and building, returns, prices,
    planning with the studio */
export const HELP: Section[] = [
  {
    id: "how",
    head: "One panel, one unit, two bases",
    body: [
      "Every piece is 18 mm birch plywood bolted to panels on a 60 by 40 by 40 cm unit. The working face carries a grid of holes that take hooks, trays, rails and shelves; the outside face is plain. Bodies stand on adjustable pads or on casters with brakes. Nothing is cut to order, so nothing is late.",
      "Small pieces settle one spot: by the door, beside the bed, next to the desk, in the kitchen. Walls for a room are the same panels as double-sided segments, end to end, built in place.",
    ],
  },
  {
    id: "delivery",
    head: "Delivery and building",
    body: [
      "Flat, in boxes under 20 kg, packed by segment. One key does every bolt and it ships parked in the base. Parts are numbered, the bolts come in one bag grouped by step, and a 1:1 floor paper of the footprint is in the box. A small piece is about an evening for one person. A wall takes two people and is built where it stands.",
      "Nothing is drilled, except the 160 cm pieces, which take one anti-tip screw. Delivery areas and lead times are confirmed when ordering opens; the studio does not state them until they are true.",
    ],
  },
  {
    id: "returns",
    head: "Returns and repairs",
    body: [
      "Unbuilt, a piece is returnable. Built, a damaged part is replaced on its own, because every part is a panel, a base or a top with a number. The terms page has the policy in full.",
    ],
  },
  {
    id: "prices",
    head: "Where a price comes from",
    body: [
      "Every price in the studio is an estimate counted from the parts: the panels, the bases and the hardware, with the studio's overhead, rounded to five dollars, in Singapore dollars. The Detail of any piece shows the lines. Ordering opens when the first prices are final; an order placed in the studio is priced again on the server from the same catalogue, so what you pay is what the catalogue says that day.",
    ],
  },
  {
    id: "reach",
    head: "We plan it with you",
    body: [
      "Tell us about the spot: the problem in a sentence, or a photo of the wall and two measurements by mail. We draw the piece into your room to scale and answer within a few days, with the parts, the boxes and the build time. No commission, no commitment.",
    ],
  },
];

/** the terms, and the refund policy inside them */
export const TERMS: Section[] = [
  {
    id: "as-is",
    head: "The studio as it is",
    body: [
      "The studio is being built and is offered as it is. It may change or pause without notice. Keep your own copy of anything you cannot lose, which Export gives you. These terms are the studio's own words, not yet reviewed by a lawyer; they will be, before ordering opens.",
    ],
  },
  {
    id: "prices",
    head: "Prices and orders",
    body: [
      "Every price is an estimate counted from the parts and says so. An order is a request to buy until it is paid. At checkout the order is priced again from the catalogue of that day; if a price has moved, the new one is shown before anything is paid. Payment is taken on the payment provider's own page; the studio never sees a card number.",
    ],
  },
  {
    id: "refunds",
    head: "Cancelling, returns and refunds",
    body: [
      "An order that is not yet paid can be cancelled from the studio's Orders, at any time, without a word to anyone.",
      "A paid order is refunded by writing to the studio with the order's id. A refund goes back the way it was paid, through the payment provider, and the order reads Refunded as soon as the provider confirms it. Unbuilt, a piece is returnable; built, a damaged part is replaced on its own.",
    ],
  },
  {
    id: "account",
    head: "Your account",
    body: [
      "An account is one person's, under an email that reaches them. The studio may end an account that is used to harm the service or other people, and will say so by mail. You can end yours at any time from the studio's gear, under Account.",
    ],
  },
  {
    id: "yours",
    head: "What you make",
    body: [
      "The rooms you draw and the pieces you place are yours. Pictures and models made for a room item come from the providers named on the privacy page, under their terms, and are kept with your project for your own use.",
    ],
  },
  {
    id: "contact",
    head: "Reaching the studio",
    body: [
      `Questions about an order, a refund or these terms: ${SITE.contact}.`,
    ],
  },
];

/** what the studio keeps, where, and what each service sees */
export const PRIVACY: Section[] = [
  {
    id: "browser",
    head: "Without an account",
    body: [
      "The studio works in your browser. Your projects, the rooms in them, your orders, the room items you make and the pictures on your board are kept in this browser's own storage and nowhere else. Nothing about you is sent anywhere until you ask something of a service below.",
    ],
  },
  {
    id: "account",
    head: "With an account",
    body: [
      "An account holds your name, your email address, a hash of your password (never the password itself), whether the email is confirmed, and the sessions you have open, each with the browser it was opened from. Signed in, the studio mirrors your projects, orders, room items, board and what the guide has shown you to the account, so they are there on every device you sign in on. The browser stays the truth; the account is its mirror.",
      "You can change your name and your password, sign the other devices out, download everything the account holds, and end the account from the studio's gear, under Account. Ending it deletes the account, its mirror and any rooms you shared by link, and takes your address off anything you wrote to the studio; an order you placed stays in the shop's ledger with its delivery details, as a sale must. What is in your browser stays there.",
    ],
  },
  {
    id: "mail",
    head: "Mail from the studio",
    body: [
      "The studio writes to you about your account (a link to confirm a new account's email, a link to set a new password when you ask for one), about an order you placed (placed, paid, delivered, refunded, each once), to say it has a word you wrote to it, and once when ordering opens, if you left your email for it. Nothing else, and never a newsletter.",
    ],
  },
  {
    id: "cookies",
    head: "Cookies",
    body: [
      "One cookie, the session, which says who is signed in. There is no analytics cookie and no advertising.",
    ],
  },
  {
    id: "services",
    head: "The services behind the studio",
    body: [
      "The site runs on Vercel and its database is Neon Postgres; both see the traffic they serve. Mail goes through Resend, which sees the address and the link it carries. When Eva is backed by a model, what you write to her and the room she is asked about go to Anthropic for that answer. When room items are drawn and modelled, the few words describing the item go to fal.ai. When payment is wired in, the order and the delivery address go to Stripe. Each receives only what that request needs, and only when you make it.",
    ],
  },
  {
    id: "words",
    head: "A word to the studio",
    body: [
      "Feedback, from the studio's gear, is kept in the studio's own table with your email, the page they were written from and the project open at the time, so that an answer can reach you and be about the right room. It is read by the studio and nobody else.",
    ],
  },
  {
    id: "shared",
    head: "Shared rooms",
    body: [
      "Share a link makes a copy of the open room, without Eva's side, under a short address. Anyone with the link can see that copy and take it into a studio of their own. Stop sharing, under Account, takes the link down.",
    ],
  },
  {
    id: "contact",
    head: "Questions",
    body: [
      `Requests about your data, or anything that went wrong: ${SITE.contact}. The terms page says how orders and refunds work.`,
    ],
  },
];

/** the words every form shares */
export const ONE_MOMENT = "One moment";
export const TRY_AGAIN = "That did not work; try again.";
