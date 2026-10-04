import { useEffect } from "react";
import { create } from "zustand";
import type { AssetCategory } from "./assets-data";

/**
 * The orders: what was taken to checkout, for whom and where, and where
 * each stands (awaiting payment, paid, delivered, cancelled, refunded, as
 * the shop's own ledger has them). Placing an order takes the cart's
 * pieces; paying is not connected in this build, so an order waits at
 * "awaiting payment" and can be cancelled meanwhile. Kept in the browser
 * until accounts land.
 */
const KEY = "furnishes.orders";

type OrderStatus =
  | "pending_payment"
  | "paid"
  | "fulfilled"
  | "cancelled"
  | "refunded";

export const STATUS_NAMES: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  fulfilled: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export type Address = {
  recipient: string;
  line1: string;
  postal: string;
  phone: string;
};

type OrderLine = {
  /** the piece's id in the room it was ordered from */
  pieceId: string;
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
};

type OrderState = {
  orders: Order[];
  place: (lines: OrderLine[], address: Address) => Order;
  /** only an order awaiting payment can be cancelled */
  cancel: (id: string) => void;
  setStatus: (id: string, status: OrderStatus) => void;
};

/** an order number: FN- and the time in base 36, upper case */
const nextId = () => `FN-${Date.now().toString(36).slice(-5).toUpperCase()}`;

export const useOrders = create<OrderState>((set) => ({
  orders: [],
  place: (lines, address) => {
    const order: Order = {
      id: nextId(),
      at: Date.now(),
      status: "pending_payment",
      lines,
      total: lines.reduce((t, l) => t + l.price, 0),
      address,
    };
    set((s) => ({ orders: [order, ...s.orders] }));
    return order;
  },
  cancel: (id) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === id && o.status === "pending_payment"
          ? { ...o, status: "cancelled" }
          : o,
      ),
    })),
  setStatus: (id, status) =>
    set((s) => ({
      orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
    })),
}));

/** the pieces (by id) in an order that still stands */
export const orderedIds = (orders: Order[]) =>
  new Set(
    orders
      .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
      .flatMap((o) => o.lines.map((l) => l.pieceId)),
  );

/** the postal code and the phone as Singapore has them */
export const validAddress = (a: Address) => ({
  recipient: a.recipient.trim().length >= 2,
  line1: a.line1.trim().length >= 4,
  postal: /^\d{6}$/.test(a.postal.trim()),
  phone: /^(\+65\s?)?[689]\d{7}$/.test(a.phone.replace(/\s/g, "")),
});

/** the orders come back on arrival and are kept on every change */
export function useOrdersSync() {
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const kept = JSON.parse(raw) as { orders?: Order[] };
        if (Array.isArray(kept.orders))
          useOrders.setState({ orders: kept.orders });
      }
    } catch {
      /* nothing kept, or storage blocked */
    }
    return useOrders.subscribe((s) => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ orders: s.orders }));
      } catch {
        /* the orders last the session */
      }
    });
  }, []);
}
