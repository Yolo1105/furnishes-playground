"use client";

import { Dialog } from "./Dialog";
import { OrderList } from "./OrderList";

/** the orders, from the gear's menu */
export function OrdersDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Orders" onClose={onClose} wide>
      <OrderList />
    </Dialog>
  );
}
