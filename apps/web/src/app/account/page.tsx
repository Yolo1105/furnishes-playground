import type { Metadata } from "next";
import { Suspense } from "react";
import { Home } from "@/components/site/Home";

export const metadata: Metadata = { title: "Account" };

/** The account's page: the way in, and the doors to the studio. */
export default function Page() {
  // the page reads the address (which studio to open), so it renders
  // inside a boundary while the page itself stays static
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
