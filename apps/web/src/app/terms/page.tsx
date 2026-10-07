import type { Metadata } from "next";
import { Terms } from "@/components/site/Terms";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms & refunds",
  description: `The terms of ${SITE.name}: prices as estimates, orders, cancelling, returns and refunds, accounts, and what you make.`,
};

/** The terms, and the refund policy inside them. */
export default function Page() {
  return <Terms />;
}
