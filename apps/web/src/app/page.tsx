import { Suspense } from "react";
import { Studio } from "@/components/studio/Studio";

/** The studio with square, edge-to-edge glass panels. */
export default function Page() {
  // the shell reads the address (a link into a project), so it renders
  // inside a boundary while the page itself stays static
  return (
    <Suspense>
      <Studio corners="square" />
    </Suspense>
  );
}
