import { sgd } from "./assets-data";
import { STATUS_NAMES, type Order } from "./order-store";
import type { Project } from "./project-store";

/** What the home page reads off the stores: a room shared by link, how
    long ago something happened, what a project's cart holds, and the
    recent activity across projects, orders and shares. */
export type Share = { id: string; name: string; at: number };

const MIN = 60_000;
/** "just now", "12 min ago", "3h ago", "Yesterday", "4d ago", then the date */
export const ago = (at: number, now = Date.now()) => {
  const m = Math.round((now - at) / MIN);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(at).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
  });
};

/** the pieces a project's saved cart holds, and what they come to */
export const cartOf = (p: Project | undefined) => {
  const s = p?.data?.scene;
  if (!s) return { n: 0, total: 0 };
  const inCart = s.groups
    .flatMap((g) => g.items)
    .filter((n) => s.cart.includes(n.id));
  return {
    n: inCart.length,
    total: inCart.reduce((t, n) => t + (n.price ?? 0), 0),
  };
};

export type Activity = { at: number; text: string };
/** the latest few things that happened, newest first */
export const activityOf = (
  projects: Project[],
  orders: Order[],
  shares: Share[],
  max = 6,
): Activity[] =>
  [
    ...projects
      .filter((p) => p.at > 0)
      .map((p) => ({ at: p.at, text: `${p.name} changed` })),
    ...orders.map((o) => ({
      at: o.at,
      text: `Order ${o.id} · ${STATUS_NAMES[o.status]} · ${sgd(o.total)}`,
    })),
    ...shares.map((s) => ({ at: s.at, text: `${s.name} shared by link` })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, max);
