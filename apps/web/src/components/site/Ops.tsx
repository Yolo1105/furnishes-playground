import { desc } from "drizzle-orm";
import { sgd } from "@/components/studio/assets-data";
import { DAILY_USD, dayStart, monthStart, spentByKind } from "@/lib/cost";
import { getDb } from "@/lib/db";
import { helpRequest, orders, waitlist } from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { STATUS_NAMES, type OrderStatus } from "@/lib/orders";
import { missingForHosting, services } from "@/lib/services";
import { HomeRail } from "./HomeRail";
import {
  HelpActions,
  OrderActions,
  WaitlistActions,
  type OrderRow,
} from "./OpsActions";

/**
 * The studio's operations, for an admin: the orders and where each
 * stands with the moves the studio makes (paid another way, delivered,
 * cancelled, refunded) and a note; the words people wrote, with a
 * reply by mail and a mark once answered; the waitlist, as a file and
 * with the one note it is promised; and what the providers cost today
 * and this month against the caps, with which services are on. Read
 * on the server on every open; an action re-reads it.
 */
const LATEST = 200;
const when = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});
const usd = (n: number) =>
  `US$${n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const KIND_NAMES = { chat: "Eva's turns", item: "Items", review: "Reviews" };
type Address = { recipient: string; line1: string; postal: string };
type Line = { name: string; sgd: number };

export async function Ops({ admin }: { admin: string }) {
  const { db, ready } = getDb();
  await ready;
  const [orderRows, helpRows, waitRows, today, month] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.at)).limit(LATEST),
    db.select().from(helpRequest).orderBy(desc(helpRequest.at)).limit(LATEST),
    db
      .select({ email: waitlist.email, notifiedAt: waitlist.notifiedAt })
      .from(waitlist),
    spentByKind(dayStart()),
    spentByKind(monthStart()),
  ]);
  const open = helpRows.filter((h) => !h.answeredAt).length;
  const due = waitRows.filter((w) => !w.notifiedAt).length;
  const s = services();
  const missing = missingForHosting(s);
  const sum = (rows: { usd: number }[]) => rows.reduce((t, r) => t + r.usd, 0);
  const spend = (kind: keyof typeof KIND_NAMES) => ({
    today: today.find((r) => r.kind === kind),
    month: month.find((r) => r.kind === kind),
  });
  return (
    <div className="home">
      <HomeRail current="ops" />
      <section className="home-stage">
        <div className="home-canvas">
          <header className="home-head">
            <p className="home-eye">Operations</p>
            <h1 className="home-title">The studio, as it stands today.</h1>
            <p className="home-sub">
              Signed in as {admin}. {orderRows.length} orders, {open} unanswered
              {open === 1 ? " word" : " words"}, {waitRows.length} on the
              waitlist ({due} not yet written to).
            </p>
          </header>

          <section className="ops-section" aria-labelledby="ops-orders">
            <h2 className="home-eye" id="ops-orders">
              Orders
            </h2>
            {orderRows.length === 0 ? (
              <p className="home-sub">No order yet.</p>
            ) : (
              <ul className="ops-list">
                {orderRows.map((o) => {
                  const a = o.address as Address;
                  const lines = o.lines as Line[];
                  const row: OrderRow = {
                    id: o.id,
                    status: o.status as OrderStatus,
                    note: o.note,
                  };
                  return (
                    <li key={o.id} className="ops-item" data-id={o.id}>
                      <div className="ops-item-head">
                        <b className="ops-id">{o.id}</b>
                        <span className="ops-status" data-status={o.status}>
                          {STATUS_NAMES[o.status as OrderStatus]}
                        </span>
                        <span className="ops-when">{when.format(o.at)}</span>
                        <span className="ops-total">{sgd(o.total)}</span>
                      </div>
                      <p className="ops-text">
                        {lines.map((l) => l.name).join(", ")} · to {a.recipient}
                        , {a.line1}, Singapore {a.postal}
                        {o.email ? ` · ${o.email}` : " · no email"}
                        {o.paymentRef ? " · Stripe" : " · offline"}
                      </p>
                      <OrderActions order={row} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="ops-section" aria-labelledby="ops-help">
            <h2 className="home-eye" id="ops-help">
              Words to the studio
            </h2>
            {helpRows.length === 0 ? (
              <p className="home-sub">Nobody has written yet.</p>
            ) : (
              <ul className="ops-list">
                {helpRows.map((h) => (
                  <li
                    key={h.id}
                    className="ops-item"
                    data-id={h.id}
                    data-answered={Boolean(h.answeredAt)}
                  >
                    <div className="ops-item-head">
                      <b className="ops-id">{h.category}</b>
                      <span className="ops-status">
                        {h.answeredAt
                          ? `Answered ${when.format(h.answeredAt)}`
                          : "Open"}
                      </span>
                      <span className="ops-when">{when.format(h.at)}</span>
                      <span className="ops-total">{h.email}</span>
                    </div>
                    <p className="ops-text ops-message">{h.message}</p>
                    {h.context && (
                      <p className="ops-text">Where they were: {h.context}</p>
                    )}
                    <HelpActions
                      id={h.id}
                      email={h.email}
                      category={h.category}
                      message={h.message}
                      answered={Boolean(h.answeredAt)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ops-section" aria-labelledby="ops-waitlist">
            <h2 className="home-eye" id="ops-waitlist">
              Waitlist
            </h2>
            <p className="home-sub">
              {waitRows.length}{" "}
              {waitRows.length === 1 ? "address" : "addresses"}, {due} still to
              be written to. The list promises one note, the day ordering opens,
              and never a second.
            </p>
            <WaitlistActions due={due} />
          </section>

          <section className="ops-section" aria-labelledby="ops-spend">
            <h2 className="home-eye" id="ops-spend">
              Spend and services
            </h2>
            <table className="ops-table">
              <thead>
                <tr>
                  <th scope="col">What</th>
                  <th scope="col">Today</th>
                  <th scope="col">This month</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(KIND_NAMES) as (keyof typeof KIND_NAMES)[]).map(
                  (kind) => {
                    const { today: t, month: m } = spend(kind);
                    return (
                      <tr key={kind}>
                        <th scope="row">{KIND_NAMES[kind]}</th>
                        <td>
                          {usd(t?.usd ?? 0)} · {t?.calls ?? 0}
                        </td>
                        <td>
                          {usd(m?.usd ?? 0)} · {m?.calls ?? 0}
                        </td>
                      </tr>
                    );
                  },
                )}
                <tr>
                  <th scope="row">All, against the day&apos;s cap</th>
                  <td>
                    {usd(sum(today))}
                    {DAILY_USD.site > 0 ? ` of ${usd(DAILY_USD.site)}` : ""}
                  </td>
                  <td>{usd(sum(month))}</td>
                </tr>
              </tbody>
            </table>
            <p className="home-sub">
              A caller&apos;s day is{" "}
              {DAILY_USD.caller > 0 ? usd(DAILY_USD.caller) : "uncapped"};{" "}
              {LIMITS.chatTurnsPerHour} turns and {LIMITS.itemsPerHour} items an
              hour, {LIMITS.reviewsPerDay} reviews a day. This server runs on{" "}
              {s.host} with {s.database}; mail {s.mail}, model {s.model},
              pictures {s.images}, payments {s.payments.checkout} (webhook{" "}
              {s.payments.webhook}), Google {s.auth.google}, the nightly sweep{" "}
              {s.cron}
              {s.commit ? `, build ${s.commit}` : ""}.
              {missing.length > 0 &&
                ` A hosted deployment would still need ${missing.join(", ")}.`}
            </p>
          </section>
        </div>
      </section>
    </div>
  );
}
