import type { Metadata } from "next";
import { SharePage } from "@/components/studio/SharePage";

/** a shared room is its owner's to show, not a crawler's to list */
export const metadata: Metadata = {
  title: "A shared room",
  robots: { index: false, follow: false },
};

/** A room someone shared: read-only, with a way to take it into a studio. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SharePage id={id} />;
}
