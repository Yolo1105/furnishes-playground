import { addressLine, type Address } from "./address";
import type { orders } from "./db/schema";
import { log, reasonOf } from "./log";
import { type Mail, sendMail } from "./mail";
import { sgd } from "./money";
import type { OrderStatus, Priced } from "./orders";
import { SITE } from "./site";

/**
 * The studio's mails to a buyer or a sender, each a short plain-text
 * letter in the site's voice: an order placed, paid, delivered or
 * refunded; thanks for a word to the studio; and the one note to the
 * waitlist the day ordering opens. Every one goes through sendMail, so
 * a development server keeps them and the tests read them. A mail with
 * nowhere to go (a guest order without an email) is simply not sent.
 */
export type OrderMail = {
  id: string;
  /** the shopper's key on it, for the link to its page */
  key: string;
  email: string | null;
  lines: Pick<Priced, "name" | "sgd">[];
  total: number;
  address: Pick<Address, "recipient" | "line1" | "postal">;
};

/** an order's row, as the letters read it */
export const orderMailOf = (o: typeof orders.$inferSelect): OrderMail => ({
  id: o.id,
  key: o.key,
  email: o.email,
  lines: o.lines as OrderMail["lines"],
  total: o.total,
  address: o.address as OrderMail["address"],
});

const sign = `\n\n${SITE.name}\n${SITE.url}`;
const linesOf = (o: OrderMail) =>
  o.lines.map((l) => `  ${l.name} · ${sgd(l.sgd)}`).join("\n");
const to = (o: OrderMail) => addressLine(o.address);
/** the order's own page, where it stands and can be paid or cancelled */
export const orderUrl = (o: Pick<OrderMail, "id" | "key">) =>
  `${SITE.url}/orders/${encodeURIComponent(o.id)}?key=${encodeURIComponent(o.key)}`;

/** a mail that cannot go (no address, or the provider refused) is said
    in the log and never fails the order or the request it rode on */
const send = async (mail: Mail | null) => {
  if (!mail) return "unsent" as const;
  try {
    return await sendMail(mail);
  } catch (error) {
    log.warn("mail.dropped", {
      subject: mail.subject,
      reason: reasonOf(error),
    });
    return "unsent" as const;
  }
};

export const orderPlacedMail = (o: OrderMail) =>
  send(
    o.email
      ? {
          to: o.email,
          key: `${o.id}-placed`,
          subject: `Order ${o.id} is placed`,
          text: `Hello ${o.address.recipient},\n\nYour order ${o.id} is placed and awaits payment.\n\n${linesOf(o)}\n  Total ${sgd(o.total)} (an estimate until paid; the catalogue's price that day is what is charged)\n\nTo: ${to(o)}\n\nIt stands at ${orderUrl(o)}, where it can be paid or cancelled while it waits.${sign}`,
        }
      : null,
  );

export const orderPaidMail = (o: OrderMail) =>
  send(
    o.email
      ? {
          to: o.email,
          key: `${o.id}-paid`,
          subject: `Order ${o.id} is paid, thank you`,
          text: `Hello ${o.address.recipient},\n\nOrder ${o.id} is paid: ${sgd(o.total)} for\n\n${linesOf(o)}\n\nIt will be delivered flat, in boxes, to ${to(o)}. We write again when it is on its way. It stands at ${orderUrl(o)}.${sign}`,
        }
      : null,
  );

export const orderDeliveredMail = (o: OrderMail) =>
  send(
    o.email
      ? {
          to: o.email,
          key: `${o.id}-delivered`,
          subject: `Order ${o.id} is delivered`,
          text: `Hello ${o.address.recipient},\n\nOrder ${o.id} is delivered to ${to(o)}. One key does every bolt, and the parts are numbered; the help page says how it goes together. If a part came damaged, write to ${SITE.contact} with the part's number and it is replaced on its own.${sign}`,
        }
      : null,
  );

export const orderRefundedMail = (o: OrderMail) =>
  send(
    o.email
      ? {
          to: o.email,
          key: `${o.id}-refunded`,
          subject: `Order ${o.id} is refunded`,
          text: `Hello ${o.address.recipient},\n\nOrder ${o.id} is refunded: ${sgd(o.total)} goes back the way it was paid, which takes the payment provider a few days. It stands at ${orderUrl(o)}.${sign}`,
        }
      : null,
  );

export const helpReceivedMail = (email: string, message: string) =>
  send({
    to: email,
    subject: `We have your word to ${SITE.name}`,
    text: `Thank you. We read every one, and answer to this address.\n\nYou wrote:\n\n${message}${sign}`,
  });

export const waitlistNoteMail = (email: string) =>
  send({
    to: email,
    key: `waitlist-${email}`,
    subject: `${SITE.name}: ordering is open`,
    text: `You asked for one note the day ordering opens at ${SITE.name}. This is it.\n\nThe studio is at ${SITE.url}: plan the room at your measurements, see the pieces in it, and order the ones you want. Every price is counted from the parts, and the help page says how a piece arrives and goes together.\n\nThis is the only mail the list sends.${sign}`,
  });

/** the letter an order's move earns, if any: paid, delivered or
    refunded; placed has its own moment, cancelled none */
export const orderMovedMail = (o: OrderMail, to: OrderStatus) =>
  to === "paid"
    ? orderPaidMail(o)
    : to === "fulfilled"
      ? orderDeliveredMail(o)
      : to === "refunded"
        ? orderRefundedMail(o)
        : Promise.resolve("unsent" as const);
