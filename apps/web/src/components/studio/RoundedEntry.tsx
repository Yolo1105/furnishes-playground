"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { READINGS, type Reading } from "@/lib/site";
import { Studio } from "./Studio";

/* the ways into the studio's address that are not the studio:
   each comes only when its link is followed, never with the studio */
const SharePage = dynamic(() =>
  import("./SharePage").then((m) => ({ default: m.SharePage })),
);
const OrderPage = dynamic(() =>
  import("@/components/site/OrderPage").then((m) => ({
    default: m.OrderPage,
  })),
);
const ReadPage = dynamic(() =>
  import("@/components/site/ReadPage").then((m) => ({
    default: m.ReadPage,
  })),
);
const ProofPage = dynamic(
  () =>
    import("@/components/proof/ProofPage").then((m) => ({
      default: m.ProofPage,
    })),
  { ssr: false },
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
 * with its ?key=), a new password from the reset mail (?token=, or
 * the ?error= the auth server sends back with a link that has lapsed),
 * or one of the readings: help, the terms, the privacy note (?read=,
 * where /help, /terms and /privacy lead). And round 10's proof, one
 * bookcase in a product studio (?proof=bookcase, with view=45|front,
 * mode=raster|trace and spp), never with the studio.
 */
export function RoundedEntry() {
  const params = useSearchParams();
  const share = params.get("share");
  if (share) return <SharePage id={share} />;
  const order = params.get("order");
  if (order) return <OrderPage id={order} orderKey={params.get("key") ?? ""} />;
  if (params.has("token") || params.get("error") === "INVALID_TOKEN")
    return <ResetPassword />;
  if (params.get("proof") === "bookcase")
    return (
      <ProofPage
        view={params.get("view") === "front" ? "front" : "45"}
        mode={params.get("mode") === "trace" ? "trace" : "raster"}
        spp={Math.max(1, Number(params.get("spp")) || 512)}
      />
    );
  const read = params.get("read");
  if (READINGS.includes(read as Reading))
    return <ReadPage reading={read as Reading} />;
  return <Studio corners="rounded" />;
}
