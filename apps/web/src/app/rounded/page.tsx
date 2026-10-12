import type { Metadata } from "next";
import { Suspense } from "react";
import { RoundedEntry } from "@/components/studio/RoundedEntry";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Plan a room at your measurements, see the pieces in it in 2D and 3D, and order the ones you want.",
};

/** The site's one page: the studio with floating, rounded glass
    panels, and what a shared room's, an order's or a reset mail's link
    opens (RoundedEntry). */
export default function Page() {
  // the page reads the address (a link into a project, a share, an
  // order, a reset), so it renders inside a boundary while the page
  // itself stays static
  return (
    <Suspense>
      <RoundedEntry />
    </Suspense>
  );
}
