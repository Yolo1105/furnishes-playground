"use client";

import { useEffect } from "react";
import { Dialog } from "./Dialog";
import { OrderList } from "./OrderList";
import { refreshOrder, useOrders } from "./order-store";

/** the orders, from the gear's menu; each the server knows is read
    anew as the list opens, so a payment or a delivery that happened
    elsewhere shows */
export function OrdersDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    for (const o of useOrders.getState().orders)
      if (o.key) void refreshOrder(o.id, o.key);
  }, []);
  return (
    <Dialog title="Orders" onClose={onClose} wide>
      <OrderList />
    </Dialog>
  );
}
