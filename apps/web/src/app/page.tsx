import { Suspense } from "react";
import { Home } from "@/components/studio/Home";

/** Where the site opens: the account's home, the way in, and the doors
    to the studio. */
export default function Page() {
  // the page reads the address (which studio to open, a view), so it
  // renders inside a boundary while the page itself stays static
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
