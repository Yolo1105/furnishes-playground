import { AskForm } from "./AskForm";
import { HELP } from "./copy";
import { pageLabel } from "./pages";
import { Prose } from "./Prose";
import { SitePage } from "./SitePage";

/** How it works, and how to reach the studio: the help sections
    (copy.ts), and under the last one the form that asks us. */
export function Help() {
  return (
    <SitePage
      current="help"
      eye={pageLabel("help")}
      title="How it works, and how to reach us."
      sub="One panel system, built by you with one key. What arrives, what can go back, where a price comes from, and a form for the spot that bothers you."
    >
      <Prose sections={HELP} />
      <AskForm />
    </SitePage>
  );
}
