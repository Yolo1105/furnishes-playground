import { create } from "zustand";
import { useLocalMirror } from "./local-mirror";
import type { Address } from "@/lib/address";
import { STATUS_NAMES, type OrderStatus } from "@/lib/orders";
import type { AssetCategory } from "./assets-data";

/**
 * The orders: what was taken to checkout, for whom and where, and where
 * each stands (awaiting payment, paid, delivered, cancelled, refunded, as
 * the shop's own ledger has them). Placing an order takes the cart's
 * pieces and keeps the order on the server too (api/checkout), which
 * hands back the shopper's key on it and, with Stripe connected, the
 * payment page; an order waits at "awaiting payment" until the webhook
 * says it is paid, and can be cancelled meanwhile. Kept in the browser
 * and mirrored to the account when signed in.
 */
const KEY = "furnishes.orders";

export { STATUS_NAMES };

type OrderLine = {
  /** the piece's id in the room it was ordered from */
  pieceId: string;
  /** the catalogue product it is, which the server prices it by */
  productId?: string;
  name: string;
  category: AssetCategory;
  price: number;
};

export type Order = {
  id: string;
  at: number;
  status: OrderStatus;
  lines: OrderLine[];
  /** S$ */
  total: number;
  address: Address;
  /** where the order's mails go, when given at checkout as a guest */
  email?: string;
  /** the shopper's key on the server's copy, once placed there */
  key?: string;
  /** the payment page, while the order waits to be paid */
  payUrl?: string;
};

type OrderState = {
  orders: Order[];
  place: (lines: OrderLine[], address: Address, email?: string) => Order;
  /** only an order awaiting payment can be cancelled */
  cancel: (id: string) => void;
  setStatus: (id: string, status: OrderStatus) => void;
  /** what the server handed back on placing: the key, the payment page */
  setPayment: (id: string, p: { key?: string; payUrl?: string }) => void;
};

/** an order number: FN- and the time in base 36, upper case (the
    route checks the shape as lib/orders OrderId) */
const nextId = () => `FN-${Date.now().toString(36).slice(-5).toUpperCase()}`;

export const useOrders = create<OrderState>((set) => ({
  orders: [],
  place: (lines, address, email) => {
    const order: Order = {
      id: nextId(),
      at: Date.now(),
      status: "pending_payment",
      lines,
      total: lines.reduce((t, l) => t + l.price, 0),
      address,
      ...(email ? { email } : {}),
    };
    set((s) => ({ orders: [order, ...s.orders] }));
    return order;
  },
  cancel: (id) => {
    const o = useOrders.getState().orders.find((x) => x.id === id);
    if (!o || o.status !== "pending_payment") return;
    set((s) => ({
      orders: s.orders.map((x) =>
        x.id === id ? withoutPage({ ...x, status: "cancelled" }) : x,
      ),
    }));
    // the server's copy follows; a copy it does not have is nothing lost
    if (o.key)
      void fetch(
        `/api/orders/${encodeURIComponent(id)}?key=${encodeURIComponent(o.key)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "cancelled" }),
        },
      ).catch(() => undefined);
  },
  setStatus: (id, status) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === id ? withoutPage({ ...o, status }) : o,
      ),
    })),
  setPayment: (id, p) =>
    set((s) => ({
      orders: s.orders.map((o) => (o.id === id ? { ...o, ...p } : o)),
    })),
}));

/** a page to pay on is for an order still waiting: any other state
    lets it go */
const withoutPage = (o: Order): Order => {
  if (o.status === "pending_payment") return o;
  const { payUrl: _gone, ...rest } = o;
  return rest;
};

/** the server's word on an order, asked by its key: where it stands and
    the page to pay on, taken into the store; nothing when it is not known */
export const refreshOrder = async (id: string, key: string) => {
  try {
    const res = await fetch(
      `/api/orders/${encodeURIComponent(id)}?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status: OrderStatus;
      payUrl?: string;
    };
    const { setStatus, setPayment } = useOrders.getState();
    setStatus(id, data.status);
    setPayment(id, { key, ...(data.payUrl ? { payUrl: data.payUrl } : {}) });
    return data.status;
  } catch {
    return null;
  }
};

/** the pieces (by id) in an order that still stands */
export const orderedIds = (orders: Order[]) =>
  new Set(
    orders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .flatMap((o) => o.lines.map((l) => l.pieceId)),
  );

/** the orders come back on arrival and are kept on every change */
const pick = (s: OrderState) => ({ orders: s.orders });
const accept = (kept: Partial<ReturnType<typeof pick>>) =>
  Array.isArray(kept.orders) ? { orders: kept.orders } : null;
export const useOrdersSync = () => useLocalMirror(useOrders, KEY, pick, accept);
