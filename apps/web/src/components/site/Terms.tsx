import { TERMS } from "./copy";
import { pageLabel } from "./pages";
import { Prose } from "./Prose";
import { SitePage } from "./SitePage";

/** The terms, with the refund policy inside them (copy.ts). */
export function Terms() {
  return (
    <SitePage
      current="terms"
      eye={pageLabel("terms")}
      title="On what terms."
      sub="The short version: prices are estimates until you pay; an unpaid order is yours to cancel; a paid one is refunded the way it was paid; what you make is yours."
    >
      <Prose sections={TERMS} />
    </SitePage>
  );
}
