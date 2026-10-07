import type { Metadata } from "next";
import { Suspense } from "react";
import { Studio } from "@/components/studio/Studio";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Plan a room at your measurements, see the pieces in it in 2D and 3D, and order the ones you want.",
};

/** The same studio with floating, rounded glass panels. */
export default function Page() {
  // the shell reads the address (a link into a project), so it renders
  // inside a boundary while the page itself stays static
  return (
    <Suspense>
      <Studio corners="rounded" />
    </Suspense>
  );
}
