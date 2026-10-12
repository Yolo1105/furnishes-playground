"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Studio } from "./Studio";

/* the three ways into the studio's address that are not the studio:
   each comes only when its link is followed, never with the studio */
const SharePage = dynamic(() =>
  import("./SharePage").then((m) => ({ default: m.SharePage })),
);
const OrderPage = dynamic(() =>
  import("@/components/site/OrderPage").then((m) => ({
    default: m.OrderPage,
  })),
);
const ResetPassword = dynamic(() =>
  import("@/components/site/ResetPassword").then((m) => ({
    default: m.ResetPassword,
  })),
);

/**
 * The one page there is. The studio, unless the address asks for one
 * of the things a link brings someone to: a room shared with them
 * (?share=), an order from its mail or from the payment page (?order=
 * with its ?key=), or a new password from the reset mail (?token=, or
 * the ?error= the auth server sends back with a link that has lapsed).
 */
export function RoundedEntry() {
  const params = useSearchParams();
  const share = params.get("share");
  if (share) return <SharePage id={share} />;
  const order = params.get("order");
  if (order) return <OrderPage id={order} orderKey={params.get("key") ?? ""} />;
  if (params.has("token") || params.get("error") === "INVALID_TOKEN")
    return <ResetPassword />;
  return <Studio corners="rounded" />;
}
