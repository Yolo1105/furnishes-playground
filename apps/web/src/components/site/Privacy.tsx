import { PRIVACY } from "./copy";
import { pageLabel } from "./pages";
import { Prose } from "./Prose";
import { SitePage } from "./SitePage";

/** What the studio keeps and on what terms, said plainly (copy.ts). */
export function Privacy() {
  return (
    <SitePage
      current="privacy"
      eye={pageLabel("privacy")}
      title="What the studio keeps."
      sub="The short version: your work lives in your browser; an account mirrors it so it follows you; nothing is sold or tracked."
    >
      <Prose sections={PRIVACY} />
    </SitePage>
  );
}
